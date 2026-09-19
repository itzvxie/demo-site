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

export function signup(email, password) {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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

export function forgotPassword(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token, password) {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}
