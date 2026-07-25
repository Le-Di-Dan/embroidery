/**
 * Session token generation and hashing (ADR-APP1-001 §3).
 *
 * The raw token is a 256-bit CSPRNG value, base64url-encoded, that lives only in
 * the cookie and in request memory. Only its SHA-256 hash is ever persisted
 * (`admin_sessions.token_hash`), so a database disclosure cannot be replayed as
 * a live session. Lookup is always by hash.
 *
 * Nothing here logs, and the raw token never appears in any return type except
 * the transient `IssuedToken` the cookie adapter consumes immediately.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

/** 256-bit token (ADR §3). */
export const TOKEN_BYTES = 32;

export type RandomBytesSource = (size: number) => Buffer;

export interface IssuedToken {
  /** The value placed in the cookie — never persisted, never logged. */
  readonly rawToken: string;
  /** The SHA-256 hash persisted and used for every lookup. */
  readonly tokenHash: string;
}

/** SHA-256, base64 — a stable one-way lookup key for a raw token. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('base64');
}

@Injectable()
export class SessionTokenService {
  constructor(@Optional() private readonly random: RandomBytesSource = randomBytes) {}

  /** Mints a fresh raw token and its storage hash. */
  issue(): IssuedToken {
    const rawToken = this.random(TOKEN_BYTES).toString('base64url');
    return { rawToken, tokenHash: hashToken(rawToken) };
  }

  /** Hashes a presented cookie token for lookup. */
  hash(rawToken: string): string {
    return hashToken(rawToken);
  }
}
