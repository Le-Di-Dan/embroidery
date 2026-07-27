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
 * The key is a v4 UUID: 36 characters of lowercase hex and hyphens, which sits
 * inside B01's 8–128 length window and its `[A-Za-z0-9._:-]` allowlist, so no
 * encoding step is needed.
 *
 * Two sources produce it, both cryptographically strong. `crypto.randomUUID()`
 * is preferred but is specified `[SecureContext]`, so it is simply **absent**
 * on a plain-HTTP origin such as the development gateway host — calling it
 * there throws before any request is made, which is exactly the failure this
 * module must not cause. `crypto.getRandomValues()` carries no such
 * restriction, so 16 CSPRNG bytes are formatted as a v4 UUID instead. There is
 * no `Math.random()` path: a weak key would silently break the arbiter, so a
 * runtime without Web Crypto altogether fails loudly.
 */

/** Thrown when the runtime cannot produce a cryptographically strong key. */
export class IdempotencyKeyUnavailableError extends Error {
  constructor() {
    super('A cryptographically strong idempotency key could not be generated.');
    this.name = 'IdempotencyKeyUnavailableError';
  }
}

const UUID_BYTE_LENGTH = 16;

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/** RFC 4122 v4 layout over 16 CSPRNG bytes: version `4`, variant `10xx`. */
function formatUuidV4(bytes: Uint8Array): string {
  const value = Uint8Array.from(bytes);
  value[6] = ((value[6] as number) & 0x0f) | 0x40;
  value[8] = ((value[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(value, toHex).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function createIdempotencyKey(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  if (typeof webCrypto?.getRandomValues === 'function') {
    return formatUuidV4(webCrypto.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH)));
  }
  throw new IdempotencyKeyUnavailableError();
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
