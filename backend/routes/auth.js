import { Router } from "express";
import {
  upsertUser,
  findUserById,
  updateUserFirstName,
  findRecentLoginCode,
  createLoginCode,
  consumeLoginCode,
  incrementLoginCodeAttempts,
} from "../db.js";
import { signSession, setSessionCookie, clearSessionCookie, readSession } from "../auth/tokens.js";
import { verifyGoogleIdToken } from "../auth/google.js";
import { verifyAppleIdToken, parseAppleUserField } from "../auth/apple.js";
import { generateLoginCode, hashLoginCode, sendLoginCodeEmail } from "../auth/email.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function issueSession(res, user) {
  const token = signSession(user);
  setSessionCookie(res, token);
}

// -- Session -----------------------------------------------------------------

router.get("/session", async (req, res) => {
  const claims = readSession(req);
  if (!claims) return res.status(401).json({ user: null });

  const user = await findUserById(claims.sub);
  if (!user) return res.status(401).json({ user: null });

  res.json({ user: { id: user.id, email: user.email, firstName: user.first_name } });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.patch("/profile", async (req, res) => {
  const claims = readSession(req);
  if (!claims) return res.status(401).json({ error: "Not signed in." });

  const { firstName } = req.body ?? {};
  if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
    return res.status(400).json({ error: "firstName is required." });
  }

  const user = await updateUserFirstName(claims.sub, firstName.trim().slice(0, 80));
  res.json({ user: { id: user.id, email: user.email, firstName: user.first_name } });
});

// -- Google --------------------------------------------------------------

router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body ?? {};
    if (!idToken) return res.status(400).json({ error: "idToken is required." });

    const payload = await verifyGoogleIdToken(idToken);
    if (!payload?.email) return res.status(401).json({ error: "Google didn't return an email for this account." });

    const user = await upsertUser({
      email: payload.email,
      firstName: payload.given_name || null,
      provider: "google",
      providerAccountId: payload.sub,
    });

    issueSession(res, user);
    res.json({
      user: { id: user.id, email: user.email, firstName: user.first_name },
      isNewUser: user.inserted,
    });
  } catch (error) {
    console.error("[novalis-ai] Google sign-in failed:", error.message);
    res.status(401).json({ error: "Could not verify that Google sign-in. Please try again." });
  }
});

// -- Apple -----------------------------------------------------------------

router.post("/apple/callback", async (req, res) => {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "/";
  try {
    const { id_token: idToken, user: rawUserField } = req.body ?? {};
    if (!idToken) throw new Error("Apple did not send an id_token.");

    const payload = await verifyAppleIdToken(idToken);
    const appleUser = parseAppleUserField(rawUserField);
    const firstName = appleUser?.name?.firstName || null;

    const user = await upsertUser({
      email: payload.email,
      firstName,
      provider: "apple",
      providerAccountId: payload.sub,
    });

    issueSession(res, user);
    res.redirect(303, `${frontendOrigin}${user.inserted ? "?newUser=1" : ""}`);
  } catch (error) {
    console.error("[novalis-ai] Apple sign-in failed:", error.message);
    res.redirect(303, `${frontendOrigin}?authError=apple`);
  }
});

// -- Email code ----------------------------------------------------------

router.post("/email/request-code", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const recent = await findRecentLoginCode(email);
    if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: "Please wait a few seconds before requesting another code." });
    }

    const code = generateLoginCode();
    const codeHash = hashLoginCode(code, email);
    await createLoginCode({ email, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    await sendLoginCodeEmail(email, code);

    res.status(204).end();
  } catch (error) {
    console.error("[novalis-ai] Failed to send login code:", error.message);
    res.status(500).json({ error: "Couldn't send that email right now. Please try again shortly." });
  }
});

router.post("/email/verify-code", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Enter the 6-digit code from your email." });
    }

    const record = await findRecentLoginCode(email);
    if (!record || record.consumed_at || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: "That code has expired. Request a new one." });
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      return res.status(400).json({ error: "Too many attempts. Request a new code." });
    }

    const candidateHash = hashLoginCode(code, email);
    if (candidateHash !== record.code_hash) {
      await incrementLoginCodeAttempts(record.id);
      return res.status(400).json({ error: "That code doesn't match. Double-check and try again." });
    }

    await consumeLoginCode(record.id);
    const user = await upsertUser({ email, provider: "email" });

    issueSession(res, user);
    res.json({
      user: { id: user.id, email: user.email, firstName: user.first_name },
      isNewUser: user.inserted,
    });
  } catch (error) {
    console.error("[novalis-ai] Failed to verify login code:", error.message);
    res.status(500).json({ error: "Something went wrong verifying that code. Please try again." });
  }
});

export default router;
