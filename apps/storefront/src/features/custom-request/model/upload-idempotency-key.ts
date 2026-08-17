/**
 * The idempotency key one customer upload action carries (`APP5-B02` §7).
 *
 * ## Why this is not `crypto.randomUUID()`
 *
 * `crypto.randomUUID` is a **secure-context-only** API. On an origin the
 * browser does not consider secure — plain HTTP on any hostname other than
 * `localhost`, which is what the development stack, the cross-layer E2E
 * topology and any internal HTTP host are — it is simply `undefined`, and
 * calling it throws inside the file-input change handler. The customer sees no
 * tile, no upload and no error, because the throw happens before a slot exists
 * to attach a failure to. `APP5-E01` observed exactly that, and on the
 * customer-owned branch it is fatal: that branch cannot be submitted without an
 * accepted item photo.
 *
 * `crypto.getRandomValues` carries no such restriction and is available in every
 * browsing context, so it is the source used whenever `randomUUID` is absent.
 * The output is the same shape either way — a v4 UUID — which keeps the value
 * inside the `[A-Za-z0-9._:-]{8,128}` contract `Idempotency-Key` accepts and
 * makes the two paths indistinguishable to the server.
 *
 * There is deliberately **no `Math.random()` fallback**. The key is the arbiter
 * that stops one customer action from becoming two stored assets, so a weak
 * source would silently weaken the guarantee; an environment with no
 * cryptographic randomness at all raises instead, and the upload fails visibly.
 */

const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

export function newUploadIdempotencyKey(): string {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID();
  }
  if (typeof source?.getRandomValues !== 'function') {
    throw new Error('No cryptographic randomness is available for an upload idempotency key.');
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  // RFC 4122 §4.4: version 4 in the high nibble of byte 6, variant 10x in the
  // two high bits of byte 8. Written out rather than assumed, so the value is a
  // real v4 UUID and not merely 32 hex characters shaped like one.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => HEX[byte] as string);
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
