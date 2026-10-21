/* =========================================================================
   API key format and hashing for the /api/v1 API. Pure — no DB, no Next.

   A key is "sig_" + 43 base64url characters (32 random bytes). Only its
   SHA-256 is stored. A plain hash, not bcrypt/scrypt, is enough here: the
   secret is 256 bits of randomness, not a human password, so there is nothing
   for a slow hash to protect against — and the lookup by hash stays a single
   indexed equality query on every request.
   ========================================================================= */

import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "sig_";
const SECRET_LENGTH = 43; // base64url of 32 bytes, unpadded
const KEY_SHAPE = /^sig_[A-Za-z0-9_-]{43}$/;

/** A new key. `key` is shown to the admin once and never stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: displayPrefix(key), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** "sig_" + the first 8 secret characters — enough to tell keys apart in
 *  Settings, nowhere near enough to guess the rest. */
export function displayPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 8);
}

/** Cheap shape check before touching the database, so junk tokens never
 *  cost a query. */
export function looksLikeApiKey(token: string): boolean {
  return token.length === API_KEY_PREFIX.length + SECRET_LENGTH && KEY_SHAPE.test(token);
}

/** The bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}
