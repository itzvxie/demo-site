const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

/**
 * Sends raw study material (or a base64 PDF) to the Novalis AI backend and
 * gets back a structured study package: summary, flashcards, quiz and a
 * two-host podcast script.
 */
export async function processStudyMaterial({
  text,
  documentBase64,
  mimeType,
  fileName,
  subject,
}) {
  const response = await fetch(`${API_BASE_URL}/api/process-study-material`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, documentBase64, mimeType, fileName, subject }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data;
}
