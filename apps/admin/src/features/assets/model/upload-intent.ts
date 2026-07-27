/**
 * The upload intent — one selected file, one idempotency key.
 *
 * `APP2-B01` arbitrates a repeated upload by `Idempotency-Key`, so the key must
 * survive an ambiguous outcome: a timeout, a dropped connection or a client
 * abort that raced server completion. Regenerating it there is precisely how a
 * single operator action becomes two stored assets, and there is no delete API
 * to undo that. A new key is therefore minted only when the operator starts a
 * genuinely new intent by clearing or replacing the file.
 *
 * The key is generated with `crypto.randomUUID()` (cryptographically strong per
 * the Web Crypto specification). Its output — 36 characters of lowercase hex
 * and hyphens — sits inside B01's 8–128 length window and its
 * `[A-Za-z0-9._:-]` allowlist, so no encoding step is needed. There is no
 * `Math.random()` fallback: a weak key would silently break the arbiter, so an
 * environment without Web Crypto fails loudly instead.
 */

/** Thrown when the runtime cannot produce a cryptographically strong key. */
export class IdempotencyKeyUnavailableError extends Error {
  constructor() {
    super('A cryptographically strong idempotency key could not be generated.');
    this.name = 'IdempotencyKeyUnavailableError';
  }
}

export function createIdempotencyKey(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID !== 'function') {
    throw new IdempotencyKeyUnavailableError();
  }
  return webCrypto.randomUUID();
}

/**
 * One operator intent. The `File` lives here and nowhere else — never in the
 * query cache, a store, the URL or web storage — and the key is never rendered,
 * logged or persisted.
 */
export interface UploadIntent {
  readonly file: File;
  readonly idempotencyKey: string;
}

export function createUploadIntent(file: File): UploadIntent {
  return { file, idempotencyKey: createIdempotencyKey() };
}
