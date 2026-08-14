/**
 * Envelope-key parsing and validation (`APP4-B01`, `ADR-APP4-001` §6.2).
 *
 * Deliberately separated from `seal`/`open`: the crypto functions take an
 * already-validated key and read no environment variable of their own, which is
 * the repository's existing split between configuration parsing and the
 * operation that consumes it (`design-session-auth.config.ts` does the same).
 * It also means a caller cannot accidentally seal under an unvalidated key.
 *
 * Fail-closed, with no default and no fallback: a process that cannot seal must
 * not issue a secret it can never deliver, and a process that cannot open must
 * not claim a job it can never complete.
 *
 * Errors name the **variable** and never the value, its length or a fragment.
 */

/** `ADR-APP4-001` §6.2 — locked at `APP4-G01`, declared empty in `.env.example`. */
export const NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV = 'NOTIFICATION_DELIVERY_ENVELOPE_KEY';

/** AES-256 takes a 256-bit key, and only a 256-bit key. */
export const ENVELOPE_KEY_BYTES = 32;

/**
 * A validated key.
 *
 * A branded wrapper rather than a bare `Buffer` so a caller cannot pass
 * arbitrary bytes into `seal`: the only way to obtain one is through validation.
 */
export interface EnvelopeKey {
  readonly bytes: Buffer;
  readonly __brand: 'EnvelopeKey';
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Parses a base64 key of exactly 32 decoded bytes.
 *
 * The re-encode comparison is not redundant. Node's base64 decoder is lenient —
 * it skips characters outside the alphabet rather than rejecting them — so
 * `"not a real key!!"` decodes to *something* instead of failing. Round-tripping
 * the decoded bytes and comparing against the normalized input is what actually
 * rejects a malformed value, rather than silently keying AES with the debris of
 * a typo.
 */
export function parseEnvelopeKey(raw: string | undefined, name: string): EnvelopeKey {
  if (raw === undefined || raw.trim() === '') {
    fail(
      `${name} is required: the notification delivery envelope is sealed with AES-256-GCM ` +
        'and there is no unencrypted fallback.',
    );
  }
  const normalized = raw.trim();
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.toString('base64') !== normalized.replace(/=+$/, '') + padding(normalized)) {
    fail(`${name} is not valid base64.`);
  }
  if (bytes.length !== ENVELOPE_KEY_BYTES) {
    fail(
      `${name} must decode to exactly ${String(ENVELOPE_KEY_BYTES)} bytes ` +
        `(got ${String(bytes.length)}).`,
    );
  }
  return { bytes, __brand: 'EnvelopeKey' };
}

/** Restores the `=` padding Node emits, so the comparison above is like-for-like. */
function padding(normalized: string): string {
  const trimmed = normalized.replace(/=+$/, '');
  const remainder = trimmed.length % 4;
  return remainder === 0 ? '' : '='.repeat(4 - remainder);
}

/**
 * Reads and validates the key from an environment map.
 *
 * Takes the map rather than touching `process.env` directly so a test — and a
 * future configuration provider — supplies its own without mutating the process.
 */
export function loadEnvelopeKey(env: NodeJS.ProcessEnv): EnvelopeKey {
  return parseEnvelopeKey(
    env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV,
  );
}
