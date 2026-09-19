import { Resend } from "resend";

let resend = null;

function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set. Add it to your environment (see .env.example).");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const from = process.env.EMAIL_FROM || "Novalis AI <onboarding@resend.dev>";

  // The Resend SDK resolves with `{ data, error }` instead of throwing for
  // API-level failures (e.g. the sandbox-mode recipient restriction), so a
  // bare `await` here would silently swallow a failed send.
  const { data, error } = await getResend().emails.send({
    from,
    to,
    subject: "Reset your Novalis AI password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111; margin-bottom: 4px;">Reset your password</h2>
        <p style="color: #444; font-size: 14px; line-height: 1.5;">
          We received a request to reset the password for your Novalis AI account.
          This link expires in 30 minutes.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="color: #888; font-size: 12px;">
          If you didn't request this, you can safely ignore this email &mdash; your password won't change.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message || "Resend rejected the email.");
  }

  return data;
}
