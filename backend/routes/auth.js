import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  upsertUser,
  findUserById,
  findUserByEmail,
  updateUserFirstName,
  createUserWithPassword,
} from "../db.js";
import { signSession, setSessionCookie, clearSessionCookie, readSession } from "../auth/tokens.js";
import { verifyGoogleIdToken } from "../auth/google.js";
import { verifyAppleIdToken, parseAppleUserField } from "../auth/apple.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 12;

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

// -- Email + password ------------------------------------------------------

router.post("/signup", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await createUserWithPassword({ email, passwordHash });

    if (!user) {
      return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
    }

    issueSession(res, user);
    res.json({
      user: { id: user.id, email: user.email, firstName: user.first_name },
      isNewUser: true,
    });
  } catch (error) {
    console.error("[novalis-ai] Signup failed:", error.message);
    res.status(500).json({ error: "Something went wrong creating your account. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const user = await findUserByEmail(email);
    // Same generic message whether the email is unknown or the account has
    // no password (e.g. was created some other way) - never reveal which.
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    issueSession(res, user);
    res.json({
      user: { id: user.id, email: user.email, firstName: user.first_name },
      isNewUser: false,
    });
  } catch (error) {
    console.error("[novalis-ai] Login failed:", error.message);
    res.status(500).json({ error: "Something went wrong signing you in. Please try again." });
  }
});

export default router;
