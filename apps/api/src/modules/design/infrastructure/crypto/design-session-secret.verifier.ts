/**
 * Session secret verification (`IMP-D043` PO-02, `APP3-B06A`).
 *
 * `HMAC-SHA-256(pepper, secret)`, compared in constant time against the stored
 * digest. Three details carry the security:
 *
 * - **The pepper is the key, not a prefix.** `hmac(pepper, secret)` and
 *   `sha256(pepper + secret)` look interchangeable and are not; the second is
 *   length-extendable and the first is what `IMP-D043` ruled.
 * - **The comparison is timing-safe.** `timingSafeEqual` throws on a length
 *   mismatch, which would itself be a timing signal, so both sides are hashed to
 *   a fixed 32 bytes first and *those* are compared. A stored digest of the
 *   wrong length then fails as a mismatch rather than as an exception.
 * - **No password hash.** The secret is 256 bits of CSPRNG, so scrypt would buy
 *   nothing and cost a deliberate delay on every request.
 *
 * `APP3-B06A` verifies only. Minting a secret belongs to `APP3-B07`, and there
 * is deliberately no `issue()` here to borrow.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import {
  DESIGN_SESSION_AUTH_CONFIG,
  type DesignSessionAuthConfig,
} from '../../config/design-session-auth.config';

/**
 * The accepted raw-secret form: unpadded base64url of 32 bytes (PO-02), which is
 * exactly 43 characters.
 */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedSessionSecret(value: string): boolean {
  return SECRET_PATTERN.test(value);
}

@Injectable()
export class DesignSessionSecretVerifier {
  constructor(
    @Inject(DESIGN_SESSION_AUTH_CONFIG) private readonly config: DesignSessionAuthConfig,
  ) {}

  /** The persisted digest for a raw secret. Base64, as `session_secret_hash` holds. */
  digest(rawSecret: string): string {
    return createHmac('sha256', this.config.secretPepper)
      .update(rawSecret, 'utf8')
      .digest('base64');
  }

  /**
   * Constant-time equality of the presented secret's digest and the stored one.
   *
   * Returns `false` rather than throwing for every malformed input, so a caller
   * cannot distinguish "bad shape" from "wrong value" by catching.
   */
  verify(rawSecret: string, storedDigest: string): boolean {
    if (!isWellFormedSessionSecret(rawSecret)) {
      return false;
    }
    return fixedWidthEquals(this.digest(rawSecret), storedDigest);
  }
}

/**
 * Compares two strings in constant time regardless of their lengths.
 *
 * Both are folded through SHA-256 first: `timingSafeEqual` requires equal-length
 * buffers and throws otherwise, and that throw would leak the length of the
 * stored digest before any comparison happened.
 */
export function fixedWidthEquals(left: string, right: string): boolean {
  const a = createHash('sha256').update(left, 'utf8').digest();
  const b = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(a, b);
}
