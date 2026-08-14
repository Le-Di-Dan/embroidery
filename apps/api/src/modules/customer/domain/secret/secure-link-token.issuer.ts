/**
 * Secure-link token issuance (`APP4-P01`, `ADR-APP4-001` §5.2).
 *
 * Thirty-two CSPRNG bytes — 256 bits — encoded as unpadded base64url, which is
 * exactly 43 characters. This mirrors `DesignSessionSecretIssuer` deliberately:
 * the same entropy, the same encoding and the same 43-character accepted form,
 * so the two opaque-credential families in this codebase behave identically and
 * a reader who knows one already knows the other.
 *
 * base64url matters twice over. It is URL-safe, and this token's only transport
 * is a URL **fragment** (`/truy-cap#t=<token>`), so an encoding that produced
 * `+`, `/` or `=` would need percent-escaping and would then round-trip
 * differently depending on who unescaped it. Node's `'base64url'` is already
 * unpadded, so nothing needs trimming.
 *
 * What this must never be, per `ADR-APP4-001` §5.2:
 *
 * - a UUID — v4 carries 122 bits, and a v7 leaks its creation time;
 * - timestamp-derived, or anything else guessable from when it was made;
 * - deterministic from the grant, the customer or the request.
 *
 * Nothing here persists or logs the token. Only the peppered digest reaches
 * `secure_access_grants.token_hash`; the raw value exists long enough to be
 * sealed into a delivery envelope and is then dropped.
 */
import { randomBytes } from 'node:crypto';

import type { RandomBytesSource } from './verification-code.issuer';

/** 256 bits (`ADR-APP4-001` §5.2 — `secure_link.token.entropyBits`). */
export const SECURE_LINK_TOKEN_BYTES = 32;

/** The length 32 bytes always occupy in unpadded base64url. */
export const SECURE_LINK_TOKEN_LENGTH = 43;

/** The accepted raw-token form, so issuance and acceptance cannot drift. */
const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${String(SECURE_LINK_TOKEN_LENGTH)}}$`);

export function isWellFormedSecureLinkToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * Issues one secure-link token.
 *
 * The source's output length is checked rather than trusted: a seam that
 * returned a short buffer would silently mint a weaker credential, and a
 * credential that is weak-but-well-formed is the failure nobody notices.
 */
export function issueSecureLinkToken(random: RandomBytesSource = randomBytes): string {
  const bytes = random(SECURE_LINK_TOKEN_BYTES);
  if (bytes.length !== SECURE_LINK_TOKEN_BYTES) {
    throw new Error(
      `Secure-link token needs ${String(SECURE_LINK_TOKEN_BYTES)} random bytes; ` +
        `the source returned ${String(bytes.length)}.`,
    );
  }
  return bytes.toString('base64url');
}
