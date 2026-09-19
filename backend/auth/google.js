import { OAuth2Client } from "google-auth-library";

let client = null;

function getClient() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not set. Add it to your environment (see .env.example).");
  }
  if (!client) client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return client;
}

/**
 * Verifies a Google Identity Services ID token and returns the verified
 * payload (email, given_name, sub, ...). Throws if the token is invalid,
 * expired, or was issued for a different client ID.
 */
export async function verifyGoogleIdToken(idToken) {
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}
