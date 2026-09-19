import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const appleJwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

/**
 * Verifies the `id_token` Apple posts back on a "Sign in with Apple"
 * callback. This only needs Apple's public keys (fetched + cached by
 * `jose`) - no private key of ours is involved, since we're validating a
 * token Apple already signed, not minting one.
 */
export async function verifyAppleIdToken(idToken) {
  if (!process.env.APPLE_SERVICES_ID) {
    throw new Error("APPLE_SERVICES_ID is not set. Add it to your environment (see .env.example).");
  }
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: process.env.APPLE_SERVICES_ID,
  });
  return payload;
}

/**
 * Apple only ever sends the user's name on the very first authorization,
 * as a JSON string in the `user` form field - never again after that.
 */
export function parseAppleUserField(rawUserField) {
  if (!rawUserField) return null;
  try {
    return JSON.parse(rawUserField);
  } catch {
    return null;
  }
}
