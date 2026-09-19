const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data;
}

/**
 * Sends raw study material (text, a base64 PDF/image, or a YouTube URL) to
 * the Novalis AI backend and gets back a structured study package for
 * whichever outputs were requested (notes/flashcards/quiz/podcast).
 */
export async function processStudyMaterial({
  text,
  documentBase64,
  mimeType,
  fileName,
  youtubeUrl,
  subject,
  outputs,
}) {
  return request("/api/process-study-material", {
    method: "POST",
    body: JSON.stringify({ text, documentBase64, mimeType, fileName, youtubeUrl, subject, outputs }),
  });
}

export function fetchHistory() {
  return request("/api/history");
}

export function fetchHistoryEntry(id) {
  return request(`/api/history/${id}`);
}

export function saveHistoryEntry({ subject, title, sourceType, studyPackage }) {
  return request("/api/history", {
    method: "POST",
    body: JSON.stringify({ subject, title, sourceType, studyPackage }),
  });
}

export function deleteHistoryEntry(id) {
  return request(`/api/history/${id}`, { method: "DELETE" });
}
