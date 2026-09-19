import { Resend } from "resend";
import crypto from "node:crypto";

let resend = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set. Add it to your environment (see .env.example).");
  }
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export function generateLoginCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashLoginCode(code, email) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set. Add it to your environment (see .env.example).");
  }
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(`${email.toLowerCase()}:${code}`)
    .digest("hex");
}

export async function sendLoginCodeEmail(to, code) {
  const from = process.env.EMAIL_FROM || "Novalis AI <onboarding@resend.dev>";

  await getResend().emails.send({
    from,
    to,
    subject: `${code} is your Novalis AI code`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, sans-serif; background: #09090b; color: #f4f4f5; padding: 40px 24px; border-radius: 16px; max-width: 420px; margin: 0 auto;">
        <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #a1a1aa; margin: 0 0 16px;">Novalis AI</p>
        <h1 style="font-size: 22px; margin: 0 0 12px;">Your sign-in code</h1>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin: 0 0 24px;">
          Enter this code to finish signing in. It expires in 10 minutes.
        </p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 0.2em; background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 16px 24px; text-align: center;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #71717a; margin: 24px 0 0;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
