/**
 * The one peppered-HMAC digest used by both APP4 secret classes
 * (`APP4-P01`, `ADR-APP4-001` §5).
 *
 * One implementation shared by issuance and verification, so the two cannot
 * drift apart about the pepper or the encoding — the property that made
 * `DesignSessionSecretIssuer` delegate its digest to the verifier rather than
 * recompute it.
 *
 * Three details carry the security, and each has a plausible-looking wrong
 * version:
 *
 * - **The pepper is the HMAC key, not a prefix.** `hmac(pepper, secret)` and
 *   `sha256(pepper + secret)` read as interchangeable and are not; the second is
 *   length-extendable.
 * - **The comparison is timing-safe, and length-safe too.** `timingSafeEqual`
 *   throws when its buffers differ in length, and that throw is itself a timing
 *   and shape signal, so both sides are folded to a fixed 32 bytes first and
 *   *those* are compared. A stored digest of the wrong length then fails as a
 *   mismatch rather than as an exception.
 * - **No password KDF.** A secure-link token is 256 bits of CSPRNG, so scrypt
 *   would buy nothing and cost a deliberate delay per request. A six-digit code
 *   has far less entropy, but its resistance comes from the five-attempt limit
 *   and the ten-minute expiry (`ADR-APP4-001` §1.3), not from hashing cost — a
 *   KDF cannot rescue a 10^6 space that an attacker only gets five guesses at.
 *
 * This deliberately does **not** import the Design Session verifier. The
 * technique is the same and the code is local: reaching into another module's
 * crypto for a shared helper is a boundary the repository does not open, and if
 * the two ever genuinely needed to share, the answer would be a package, not a
 * cross-module import.
 *
 * Nothing here logs, persists or returns the raw secret.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * `HMAC-SHA-256(pepper, rawSecret)`, base64.
 *
 * Base64 matches `design_sessions.session_secret_hash`, the existing digest
 * convention for a `text` hash column, and `contact_verification_challenges.code_hash`
 * and `secure_access_grants.token_hash` are the same `text` type.
 */
export function digestSecret(pepper: string, rawSecret: string): string {
  return createHmac('sha256', pepper).update(rawSecret, 'utf8').digest('base64');
}

/**
 * Constant-time equality of a presented secret's digest and a stored one.
 *
 * Returns `false` for every failure — wrong secret, malformed stored digest,
 * empty input — so a caller cannot distinguish "bad shape" from "wrong value" by
 * catching, and no thrown message can carry the raw code or token.
 */
export function verifySecretDigest(
  pepper: string,
  rawSecret: string,
  storedDigest: string,
): boolean {
  if (rawSecret === '' || storedDigest === '') {
    return false;
  }
  return fixedWidthEquals(digestSecret(pepper, rawSecret), storedDigest);
}

/**
 * Compares two strings in constant time regardless of their lengths.
 *
 * Folding both through SHA-256 first is what makes the length safe: without it,
 * `timingSafeEqual` throws on a length mismatch and leaks the stored digest's
 * length before any byte is compared.
 */
export function fixedWidthEquals(left: string, right: string): boolean {
  const a = createHash('sha256').update(left, 'utf8').digest();
  const b = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(a, b);
}
