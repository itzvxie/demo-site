import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { migrate } from "./db.js";
import authRouter from "./routes/auth.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 4000;
const CLAUDE_MODEL = "claude-opus-5";

// A single chunk this size (~1,600 words) keeps each segment comfortably
// inside the model's attention budget while still preserving whole
// paragraphs, and the hard ceiling below keeps a single request from
// silently ballooning into a runaway bill.
const MAX_CHUNK_CHARS = 6000;
const MAX_INPUT_CHARS = 180000; // ~45k tokens of raw study material per request
const MAX_CHUNKS_PER_REQUEST = 40;

// A short prompt (a question, or a bare topic) is treated as something to
// research rather than a document to summarize - see `researchQuestion()`.
const QUESTION_MODE_CHAR_THRESHOLD = 400;
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 5 };

for (const key of ["DATABASE_URL", "SESSION_SECRET"]) {
  if (!process.env[key]) {
    console.warn(`[novalis-ai] ${key} is not set. Sign-in will fail until it is configured (see .env.example).`);
  }
}
for (const key of ["GOOGLE_CLIENT_ID", "APPLE_SERVICES_ID"]) {
  if (!process.env[key]) {
    console.warn(`[novalis-ai] ${key} is not set - that sign-in method will be unavailable until it is configured.`);
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[novalis-ai] ANTHROPIC_API_KEY is not set. Requests to /api/process-study-material will fail until it is configured (see .env.example).",
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Structured output schema
//
// This is the contract the frontend dashboard renders against. Passing it
// through `output_config.format` makes Claude's response provably conform
// to this shape at the API level (constrained decoding), rather than hoping
// a system prompt instruction is obeyed.
// ---------------------------------------------------------------------------

const StudyPackageSchema = z.object({
  highLevelSummary: z
    .string()
    .describe(
      "A 3-sentence conversational breakdown simplifying the core concept like talking to a friend.",
    ),
  flashcards: z
    .array(
      z.object({
        front: z.string().describe("Highly targeted active recall question."),
        back: z.string().describe("Precise, punchy answer."),
      }),
    )
    .min(6)
    .max(14),
  quiz: z
    .array(
      z.object({
        question: z.string().describe("Multiple choice question phrase."),
        options: z.array(z.string()).length(4),
        correctAnswerIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(4)
    .max(10),
  podcastScript: z
    .array(
      z.object({
        speaker: z.enum(["Host Harry (Energetic)", "Host Sarah (Analytical)"]),
        text: z.string(),
      }),
    )
    .min(6)
    .max(20),
});

// ---------------------------------------------------------------------------
// RAG-lite pipeline: structural segmentation ("chunking")
//
// We split incoming study material into paragraph-bounded chunks so the
// downstream LLM call always sees a clean, token-efficient, ordered
// segmentation of the source document instead of one raw blob. Each chunk
// is tagged with an index so the model can reason about document structure
// (introductions, sub-sections, conclusions) when it writes the summary,
// flashcards, quiz and podcast script.
// ---------------------------------------------------------------------------

function splitOversizedParagraph(paragraph, maxChars) {
  const words = paragraph.split(/\s+/);
  const pieces = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function chunkText(rawText, maxChars = MAX_CHUNK_CHARS) {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (const piece of splitOversizedParagraph(paragraph, maxChars)) {
        chunks.push(piece);
      }
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      flush();
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }
  flush();

  return chunks;
}

function buildSegmentedContext(chunks) {
  return chunks
    .map(
      (chunk, index) =>
        `[[SEGMENT ${index + 1} of ${chunks.length}]]\n${chunk}`,
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the study-content engine that powers Novalis AI, a premium AI study platform. You are given study material that has already been segmented into ordered chunks by a retrieval pipeline (marked [[SEGMENT n of total]]).

Your job: read every segment as a single continuous document, then produce one complete study package for a student who wants to understand and pass their next assessment on this material.

Non-negotiable rules:
- "highLevelSummary" must read like a sharp, encouraging friend explaining the topic out loud, in exactly 3 sentences, zero jargon that isn't immediately defined.
- "flashcards" use active-recall phrasing (a real question, never a fill-in-the-blank restatement of a sentence from the source). Each "back" is a precise, punchy answer, never more than two sentences.
- "quiz" options must be four plausible, mutually exclusive choices of similar length (no giveaway options like "All of the above" unless the source material itself tests that distinction). Exactly one is correct, indexed by "correctAnswerIndex" (0-based).
- "podcastScript" alternates between "Host Harry (Energetic)", who opens with hooks, analogies and enthusiasm, and "Host Sarah (Analytical)", who grounds each point with a concrete fact or mechanism from the source material. The two hosts should sound like they are genuinely riffing off each other, not reading a script at each other.
- Every fact in every field must be traceable to the supplied segments. Never invent facts, dates, formulas or figures that are not supported by the material. If the material is too thin for the requested count of flashcards or quiz questions, generate the smallest count that stays faithful to the source rather than padding with filler.
- Write for the subject and level implied by the material itself; do not assume the reader already knows the terminology used in the source.

Return only the structured study package. Do not include any commentary outside the schema.`;

const RESEARCH_SYSTEM_PROMPT = `You are a meticulous research assistant preparing background notes for a study-content generator. A student has asked a short question or named a topic - there is no source document, so you must research it yourself.

Write a thorough, accurate, well-organized set of notes that fully answers it: key facts, dates, causes, mechanisms, and consequences as relevant to the topic. Use the web_search tool whenever you are not fully certain of a specific fact, date, figure, or anything that may have changed recently - do not guess or rely on shaky memory for specifics you can verify.

Write in plain prose paragraphs, not JSON, not bullet points. Be comprehensive but precise - no filler, no hedging, no meta-commentary about being an AI. These notes will be fed directly into another step that turns them into a summary, flashcards, a quiz and a podcast script, so make sure every fact a good study package would need is actually present.`;

/**
 * For a short question/topic (no pasted source material), research it with
 * live web search first, then feed the resulting notes into the same
 * packaging step used for real documents. This keeps the "only state facts
 * that are in the supplied material" rule in the main system prompt fully
 * intact and safe - the researched notes simply become that material,
 * instead of quietly loosening the anti-hallucination rule for this path.
 */
async function researchQuestion(question) {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: RESEARCH_SYSTEM_PROMPT,
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: question }],
  });

  const notes = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  return notes;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Cookies carry the session cross-site (frontend and backend live on
// different domains), so CORS must echo back a specific origin - "*" is
// rejected by browsers once `credentials: true` is set.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: allowedOrigins || ((origin, callback) => callback(null, true)),
    credentials: true,
  }),
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true })); // Apple's Sign In callback posts form-encoded fields
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", model: CLAUDE_MODEL });
});

app.use("/api/auth", authRouter);

app.post("/api/process-study-material", async (req, res) => {
  try {
    const { text, documentBase64, mimeType, fileName, subject } = req.body ?? {};

    if (!text && !documentBase64) {
      return res.status(400).json({
        error: "Provide either `text` (raw study material) or `documentBase64` (a base64-encoded document).",
      });
    }

    const userContent = [];
    let segmentCount = 0;
    let mode = "document";

    if (documentBase64) {
      if (mimeType !== "application/pdf") {
        return res.status(400).json({
          error: "documentBase64 must be a base64-encoded PDF (mimeType: 'application/pdf'). For plain text, use the `text` field instead.",
        });
      }
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: documentBase64,
        },
      });
      userContent.push({
        type: "text",
        text: `Process the attached document${fileName ? ` ("${fileName}")` : ""}${
          subject ? ` for the subject: ${subject}.` : "."
        } Build the full study package described in your instructions.`,
      });
    } else {
      if (text.length > MAX_INPUT_CHARS) {
        return res.status(413).json({
          error: `Study material is too large (${text.length} characters). Please split it into smaller sections (under ${MAX_INPUT_CHARS} characters each) and process them separately.`,
        });
      }

      const trimmedText = text.trim();
      const isQuestion = trimmedText.length < QUESTION_MODE_CHAR_THRESHOLD;

      if (isQuestion) {
        mode = "question";
        const researchNotes = await researchQuestion(trimmedText);
        segmentCount = 1;
        userContent.push({
          type: "text",
          text: `${subject ? `Subject: ${subject}\n` : ""}The student asked: "${trimmedText}"\n\nHere is researched background information to answer it accurately:\n\n${
            researchNotes || "(No additional research came back - answer from the question itself as best you can.)"
          }\n\nBuild the full study package described in your instructions, directly answering the student's question.`,
        });
      } else {
        mode = "source";
        const chunks = chunkText(text);
        if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
          return res.status(413).json({
            error: `Study material segmented into ${chunks.length} chunks, which exceeds the ${MAX_CHUNKS_PER_REQUEST}-chunk limit for a single request. Please split it into smaller sections.`,
          });
        }
        segmentCount = chunks.length;

        const segmentedContext = buildSegmentedContext(chunks);
        userContent.push({
          type: "text",
          text: `${
            subject ? `Subject: ${subject}\n` : ""
          }${fileName ? `Source: ${fileName}\n` : ""}Below is the study material, already segmented by the retrieval pipeline:\n\n${segmentedContext}\n\nBuild the full study package described in your instructions.`,
        });
      }
    }

    const response = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        format: zodOutputFormat(StudyPackageSchema),
        effort: "medium",
      },
    });

    if (!response.parsed_output) {
      return res.status(502).json({
        error: "Claude returned a response that could not be parsed into the expected study package shape. Please try again.",
      });
    }

    return res.json({
      ...response.parsed_output,
      meta: {
        model: response.model,
        mode,
        segments: segmentCount,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[novalis-ai] Anthropic authentication failed:", error.message);
      return res.status(500).json({ error: "AI service is misconfigured (invalid API key)." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[novalis-ai] Anthropic rate limit hit:", error.message);
      return res.status(429).json({ error: "The AI is a little overloaded right now. Please try again in a moment." });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("[novalis-ai] Anthropic rejected the request:", error.message);
      return res.status(400).json({ error: "The study material could not be processed as sent. Try a shorter excerpt." });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[novalis-ai] Anthropic API error:", error.status, error.message);
      return res.status(502).json({ error: "The AI service returned an error. Please try again." });
    }

    console.error("[novalis-ai] Unexpected error processing study material:", error);
    return res.status(500).json({ error: "Something went wrong while generating your study package." });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await migrate();
      console.log("[novalis-ai] Database schema is up to date.");
    } catch (error) {
      console.error("[novalis-ai] Failed to run database migration:", error.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`[novalis-ai] Backend listening on http://localhost:${PORT}`);
  });
}

start();
