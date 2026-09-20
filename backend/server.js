import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { GoogleGenAI, ApiError } from "@google/genai";
import { fetchTranscript } from "youtube-transcript";
import { migrate } from "./db.js";
import authRouter from "./routes/auth.js";
import historyRouter from "./routes/history.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 4000;
// Google AI Studio's free tier - no billing required. Free-tier capacity is
// shared and can get persistently overloaded on any single model, so we
// fall back down this list (most to least preferred) rather than pinning
// to just one.
const GEMINI_MODEL_CANDIDATES = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const GEMINI_MODEL = GEMINI_MODEL_CANDIDATES[0];

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
if (!process.env.RESEND_API_KEY) {
  console.warn("[novalis-ai] RESEND_API_KEY is not set - password reset emails will not be sent until it is configured.");
}

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[novalis-ai] GEMINI_API_KEY is not set. Requests to /api/process-study-material will fail until it is configured (see .env.example). Get a free key at aistudio.google.com/apikey.",
  );
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ---------------------------------------------------------------------------
// Structured output schema
//
// This is the contract the frontend dashboard renders against. Passing it
// through `responseJsonSchema` makes Gemini's response provably conform to
// this shape at the API level (constrained decoding), rather than hoping a
// system prompt instruction is obeyed.
// ---------------------------------------------------------------------------

// Each requestable output maps to one field of the full schema. The student
// picks which outputs they want before generating (see the frontend's
// generate-method picker), and we only ask Gemini to produce those fields -
// cheaper, faster, and the response naturally only contains what was asked
// for instead of always generating all four.
const OUTPUT_FIELD_JSON_SCHEMAS = {
  notes: {
    highLevelSummary: {
      type: "string",
      description: "A 3-sentence conversational breakdown simplifying the core concept like talking to a friend.",
    },
  },
  flashcards: {
    flashcards: {
      type: "array",
      minItems: 6,
      maxItems: 14,
      items: {
        type: "object",
        properties: {
          front: { type: "string", description: "Highly targeted active recall question." },
          back: { type: "string", description: "Precise, punchy answer." },
        },
        required: ["front", "back"],
      },
    },
  },
  quiz: {
    quiz: {
      type: "array",
      minItems: 4,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          question: { type: "string", description: "Multiple choice question phrase." },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correctAnswerIndex: { type: "integer", minimum: 0, maximum: 3 },
        },
        required: ["question", "options", "correctAnswerIndex"],
      },
    },
  },
};

const ALL_OUTPUTS = Object.keys(OUTPUT_FIELD_JSON_SCHEMAS);
const MIN_FLASHCARD_COUNT = 4;
const MAX_FLASHCARD_COUNT = 40;

function buildResponseJsonSchema(requestedOutputs, { flashcardCount } = {}) {
  const validOutputs = Array.isArray(requestedOutputs)
    ? requestedOutputs.filter((o) => OUTPUT_FIELD_JSON_SCHEMAS[o])
    : [];
  const outputs = validOutputs.length ? validOutputs : ALL_OUTPUTS;

  const properties = {};
  for (const output of outputs) Object.assign(properties, OUTPUT_FIELD_JSON_SCHEMAS[output]);

  if (properties.flashcards && flashcardCount) {
    const count = Math.min(MAX_FLASHCARD_COUNT, Math.max(MIN_FLASHCARD_COUNT, Math.round(flashcardCount)));
    properties.flashcards = { ...properties.flashcards, minItems: count, maxItems: count };
  }

  return {
    schema: { type: "object", properties, required: Object.keys(properties) },
    outputs,
  };
}

// ---------------------------------------------------------------------------
// RAG-lite pipeline: structural segmentation ("chunking")
//
// We split incoming study material into paragraph-bounded chunks so the
// downstream LLM call always sees a clean, token-efficient, ordered
// segmentation of the source document instead of one raw blob. Each chunk
// is tagged with an index so the model can reason about document structure
// (introductions, sub-sections, conclusions) when it writes the summary,
// flashcards and quiz.
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

const SYSTEM_PROMPT = `You are the study-content engine that powers Novalis AI, a premium AI study platform. You are given study material that has already been segmented into ordered chunks by a retrieval pipeline (marked [[SEGMENT n of total]]) - this may be pasted text, a PDF or an image the student uploaded, or a transcript pulled from a YouTube video they linked. Read all of it closely before writing anything; a student is relying on this to actually understand and pass their next assessment, so vague or generic output that could apply to any topic is a failure.

Non-negotiable rules:
- "highLevelSummary" must read like a sharp, encouraging friend explaining the topic out loud, in exactly 3 sentences, zero jargon that isn't immediately defined. It must reflect what THIS specific material actually says, not a generic textbook gloss of the topic.
- "flashcards" use active-recall phrasing (a real question, never a fill-in-the-blank restatement of a sentence from the source). Each "back" is a precise, punchy answer, never more than two sentences. When an exact flashcard count is requested, spread the cards across the full breadth of the material so they cover it well, rather than clustering on just the first section.
- "quiz" options must be four plausible, mutually exclusive choices of similar length (no giveaway options like "All of the above" unless the source material itself tests that distinction). Exactly one is correct, indexed by "correctAnswerIndex" (0-based).
- Every fact in every field must be traceable to the supplied segments. Never invent facts, dates, formulas or figures that are not supported by the material. If the material is too thin for the requested count of flashcards or quiz questions, generate the smallest count that stays faithful to the source rather than padding with filler.
- Write for the subject and level implied by the material itself; do not assume the reader already knows the terminology used in the source.

Return only the structured study package. Do not include any commentary outside the schema.`;

const RESEARCH_SYSTEM_PROMPT = `You are a meticulous research assistant preparing background notes for a study-content generator. A student has asked a short question or named a topic - there is no source document, so you must research it yourself and give them a real, substantive answer, not a hedge or a surface-level gloss.

Write a thorough, accurate, well-organized set of notes that fully answers it: key facts, dates, causes, mechanisms, and consequences as relevant to the topic. Use the Google Search tool whenever you are not fully certain of a specific fact, date, figure, or anything that may have changed recently - do not guess or rely on shaky memory for specifics you can verify.

Write in plain prose paragraphs, not JSON, not bullet points. Be comprehensive but precise - no filler, no hedging, no meta-commentary about being an AI. These notes will be fed directly into another step that turns them into a summary, flashcards and a quiz, so make sure every fact a good study package would need is actually present.`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_OVERLOAD_RETRIES = 2;
const OVERLOAD_RETRY_DELAY_MS = 1500;

// 503 is Google's documented "model overloaded" signal, but the free tier
// also throws plain 500s ("internal error encountered") under the same
// shared-capacity pressure - both are transient and worth retrying/falling
// back on, unlike a real 400/401/403/429 which retrying can't fix.
const RETRYABLE_STATUSES = new Set([500, 503]);

/**
 * The free tier shares capacity across everyone using it, so a transient
 * overload is common. Each candidate model gets a couple of quick retries,
 * and if it's still failing after that we fall back to the next model in
 * the list rather than failing outright - a differently-loaded model often
 * has capacity even when the first choice doesn't.
 */
async function generateContentWithRetry(paramsWithoutModel) {
  let lastError;
  for (const model of GEMINI_MODEL_CANDIDATES) {
    for (let attempt = 0; attempt <= MAX_OVERLOAD_RETRIES; attempt++) {
      try {
        return await genAI.models.generateContent({ ...paramsWithoutModel, model });
      } catch (error) {
        lastError = error;
        const isRetryable = error instanceof ApiError && RETRYABLE_STATUSES.has(error.status);
        if (!isRetryable) throw error;
        if (attempt < MAX_OVERLOAD_RETRIES) {
          console.warn(`[novalis-ai] Gemini ${error.status} on ${model}, retrying (${attempt + 1}/${MAX_OVERLOAD_RETRIES})...`);
          await sleep(OVERLOAD_RETRY_DELAY_MS * (attempt + 1));
        } else {
          console.warn(`[novalis-ai] Gemini ${error.status} on ${model}, falling back to the next model...`);
        }
      }
    }
  }
  throw lastError;
}

/**
 * For a short question/topic (no pasted source material), research it with
 * live web search first, then feed the resulting notes into the same
 * packaging step used for real documents. This keeps the "only state facts
 * that are in the supplied material" rule in the main system prompt fully
 * intact and safe - the researched notes simply become that material,
 * instead of quietly loosening the anti-hallucination rule for this path.
 *
 * Search grounding runs under its own quota/availability separate from
 * plain generation, so a failure here degrades gracefully (empty notes)
 * rather than failing the whole request - the packaging step already
 * handles the "no research came back" case.
 */
async function researchQuestion(question) {
  try {
    const response = await generateContentWithRetry({
      contents: question,
      config: {
        systemInstruction: RESEARCH_SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 4000,
      },
    });
    return (response.text || "").trim();
  } catch (error) {
    console.error("[novalis-ai] Research pre-pass failed, continuing without it:", error.message);
    return "";
  }
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
  res.json({ status: "ok", model: GEMINI_MODEL });
});

app.use("/api/auth", authRouter);
app.use("/api/history", historyRouter);

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

app.post("/api/process-study-material", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "AI service is misconfigured (missing GEMINI_API_KEY)." });
  }

  try {
    const { text, documentBase64, mimeType, fileName, subject, youtubeUrl, outputs, flashcardCount } = req.body ?? {};

    let effectiveText = text;
    let sourceFileName = fileName;

    if (!effectiveText && !documentBase64 && youtubeUrl) {
      try {
        const transcriptParts = await fetchTranscript(youtubeUrl);
        effectiveText = transcriptParts.map((part) => part.text).join(" ").trim();
      } catch {
        return res.status(422).json({
          error: "Couldn't fetch a transcript for that YouTube video - it may not have captions available. Try a different video, or paste the content as text instead.",
        });
      }
      if (!effectiveText) {
        return res.status(422).json({ error: "That video's transcript came back empty. Try a different video." });
      }
      sourceFileName = sourceFileName || "YouTube video";
    }

    if (!effectiveText && !documentBase64) {
      return res.status(400).json({
        error: "Provide `text` (raw study material), `documentBase64` (a base64-encoded PDF or image), or `youtubeUrl`.",
      });
    }

    const { schema: responseJsonSchema, outputs: resolvedOutputs } = buildResponseJsonSchema(outputs, {
      flashcardCount,
    });

    const parts = [];
    let segmentCount = 0;
    let mode = "document";

    if (documentBase64) {
      if (mimeType === "application/pdf") {
        parts.push({ inlineData: { mimeType: "application/pdf", data: documentBase64 } });
      } else if (SUPPORTED_IMAGE_TYPES.has(mimeType)) {
        parts.push({ inlineData: { mimeType, data: documentBase64 } });
      } else {
        return res.status(400).json({
          error: "documentBase64 must be a PDF (application/pdf) or an image (image/jpeg, image/png, image/gif, image/webp). For plain text, use the `text` field instead.",
        });
      }
      parts.push({
        text: `Process the attached ${mimeType === "application/pdf" ? "document" : "image"}${
          sourceFileName ? ` ("${sourceFileName}")` : ""
        }${subject ? ` for the subject: ${subject}.` : "."} Build the full study package described in your instructions.`,
      });
    } else {
      if (effectiveText.length > MAX_INPUT_CHARS) {
        return res.status(413).json({
          error: `Study material is too large (${effectiveText.length} characters). Please split it into smaller sections (under ${MAX_INPUT_CHARS} characters each) and process them separately.`,
        });
      }

      const trimmedText = effectiveText.trim();
      const isQuestion = !youtubeUrl && trimmedText.length < QUESTION_MODE_CHAR_THRESHOLD;

      if (isQuestion) {
        mode = "question";
        const researchNotes = await researchQuestion(trimmedText);
        segmentCount = 1;
        parts.push({
          text: `${subject ? `Subject: ${subject}\n` : ""}The student asked: "${trimmedText}"\n\nHere is researched background information to answer it accurately:\n\n${
            researchNotes || "(No additional research came back - answer from the question itself as best you can.)"
          }\n\nBuild the full study package described in your instructions, directly answering the student's question.`,
        });
      } else {
        mode = youtubeUrl ? "youtube" : "source";
        const chunks = chunkText(trimmedText);
        if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
          return res.status(413).json({
            error: `Study material segmented into ${chunks.length} chunks, which exceeds the ${MAX_CHUNKS_PER_REQUEST}-chunk limit for a single request. Please split it into smaller sections.`,
          });
        }
        segmentCount = chunks.length;

        const segmentedContext = buildSegmentedContext(chunks);
        parts.push({
          text: `${
            subject ? `Subject: ${subject}\n` : ""
          }${sourceFileName ? `Source: ${sourceFileName}\n` : ""}Below is the study material, already segmented by the retrieval pipeline:\n\n${segmentedContext}\n\nBuild the full study package described in your instructions.`,
        });
      }
    }

    const response = await generateContentWithRetry({
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema,
        maxOutputTokens: 8000,
      },
    });

    let parsedOutput;
    try {
      parsedOutput = JSON.parse(response.text ?? "");
    } catch {
      parsedOutput = null;
    }

    if (!parsedOutput) {
      return res.status(502).json({
        error: "The AI returned a response that could not be parsed into the expected study package shape. Please try again.",
      });
    }

    return res.json({
      ...parsedOutput,
      meta: {
        model: response.modelVersion || GEMINI_MODEL,
        mode,
        segments: segmentCount,
        outputs: resolvedOutputs,
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("[novalis-ai] Gemini API error:", error.status, error.message);
      if (error.status === 401 || error.status === 403) {
        return res.status(500).json({ error: "AI service is misconfigured (invalid API key)." });
      }
      if (error.status === 429) {
        return res.status(429).json({
          error: "You've hit the free daily limit for the AI. It resets after a short wait - try again in a few minutes.",
        });
      }
      if (error.status === 400) {
        return res.status(400).json({ error: "The study material could not be processed as sent. Try a shorter excerpt." });
      }
      if (error.status === 500 || error.status === 503) {
        return res.status(503).json({
          error: "The free AI model is briefly overloaded on Google's side (already retried a couple of times across models). Please try again in a moment.",
        });
      }
      return res.status(502).json({ error: `The AI service returned an error (${error.status}). Please try again.` });
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
