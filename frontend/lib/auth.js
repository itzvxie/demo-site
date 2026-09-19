const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

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

export function fetchSession() {
  return request("/api/auth/session");
}

export function requestEmailCode(email) {
  return request("/api/auth/email/request-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyEmailCode(email, code) {
  return request("/api/auth/email/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function verifyGoogleToken(idToken) {
  return request("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export function updateProfile(firstName) {
  return request("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({ firstName }),
  });
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}
