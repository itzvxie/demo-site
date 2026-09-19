import jwt from "jsonwebtoken";

export const SESSION_COOKIE_NAME = "novalis_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set. Add it to your environment (see .env.example).");
  }
  return process.env.SESSION_SECRET;
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, firstName: user.first_name || null },
    getSecret(),
    { expiresIn: "30d" },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
}

export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}
