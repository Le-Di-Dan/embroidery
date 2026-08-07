/**
 * Session secret minting (`IMP-D043` PO-02/PO-04, `APP3-B07`).
 *
 * `APP3-B06A` deliberately shipped a verifier with no `issue()` to borrow, so
 * this is the **only** place in the API that produces a session credential, and
 * `APP3-B07` is the only checkpoint that may call it.
 *
 * Thirty-two CSPRNG bytes, unpadded base64url — exactly the 43-character form
 * `isWellFormedSessionSecret` accepts, so a minted secret and an accepted secret
 * can never drift apart. Only the peppered digest is persisted; the raw value
 * exists in memory long enough to be written into one `Set-Cookie` and is never
 * returned in JSON, logged, audited or placed in a URL.
 *
 * The digest is computed by the B06A verifier rather than recomputed here: one
 * HMAC implementation, so issuance and verification cannot disagree about the
 * pepper or the encoding.
 */
import { randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

import { DesignSessionSecretVerifier } from './design-session-secret.verifier';

/** 256 bits (`IMP-D043` PO-02). */
export const SESSION_SECRET_BYTES = 32;

export type RandomBytesSource = (size: number) => Buffer;

export interface IssuedSessionSecret {
  /** Goes into the cookie and nowhere else. Never persisted, never logged. */
  readonly rawSecret: string;
  /** `HMAC-SHA-256(pepper, rawSecret)`, the only form that reaches the database. */
  readonly secretHash: string;
}

@Injectable()
export class DesignSessionSecretIssuer {
  constructor(
    private readonly verifier: DesignSessionSecretVerifier,
    // `@Optional()` is required, not decorative: without it Nest reads the
    // parameter's design-time type and tries to resolve `Function`.
    @Optional() private readonly random: RandomBytesSource = randomBytes,
  ) {}

  issue(): IssuedSessionSecret {
    const rawSecret = this.random(SESSION_SECRET_BYTES).toString('base64url');
    return { rawSecret, secretHash: this.verifier.digest(rawSecret) };
  }
}
