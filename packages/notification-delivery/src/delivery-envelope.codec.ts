/**
 * AES-256-GCM seal and open (`APP4-B01`, `ADR-APP4-001` §6.3).
 *
 * The **only** APP4 AEAD implementation. `apps/api` seals through it and
 * `apps/worker` will open through it; neither declares its own cipher, so the
 * two cannot drift on algorithm, nonce size or encoding, and there is exactly
 * one place to audit.
 *
 * `node:crypto` only — no third-party crypto package. GCM is used with its
 * standard 96-bit nonce, which is the size the mode is defined for: any other
 * length forces an extra GHASH derivation step and buys nothing.
 *
 * **A fresh nonce per seal is not a style choice.** Reusing an IV under one key
 * in GCM leaks the XOR of the two plaintexts and, worse, allows the
 * authentication key to be recovered — so `sealDeliveryEnvelope` generates its
 * own and offers no parameter to supply one. The injectable random source
 * exists for tests and still produces a distinct nonce per call.
 *
 * Nothing here logs. Failures throw a message that names the failure class and
 * never the plaintext, the key or the ciphertext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import {
  DELIVERY_ENVELOPE_ALGORITHM,
  DELIVERY_ENVELOPE_VERSION,
  isDeliveryEnvelope,
  isDeliverySecretKind,
  type DeliveryEnvelope,
  type DeliveryPayload,
} from './delivery-envelope.contract';
import type { EnvelopeKey } from './envelope-key';

/** GCM's defined nonce size: 96 bits. */
export const ENVELOPE_IV_BYTES = 12;

/** The `node:crypto` cipher name behind `DELIVERY_ENVELOPE_ALGORITHM`. */
const CIPHER = 'aes-256-gcm';

export type RandomBytesSource = (size: number) => Buffer;

/**
 * Seals a payload into a persistable envelope.
 *
 * The IV is generated here and nowhere else. The plaintext is JSON so the worker
 * can read it back without a bespoke framing format; it never reaches disk in
 * that form.
 */
export function sealDeliveryEnvelope(
  key: EnvelopeKey,
  payload: DeliveryPayload,
  random: RandomBytesSource = randomBytes,
): DeliveryEnvelope {
  if (!isDeliverySecretKind(payload.secretKind)) {
    throw new Error(`Unknown delivery secret kind: refusing to seal.`);
  }
  const iv = random(ENVELOPE_IV_BYTES);
  if (iv.length !== ENVELOPE_IV_BYTES) {
    throw new Error(
      `Delivery envelope needs a ${String(ENVELOPE_IV_BYTES)}-byte nonce; ` +
        `the source returned ${String(iv.length)}.`,
    );
  }

  const cipher = createCipheriv(CIPHER, key.bytes, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return {
    version: DELIVERY_ENVELOPE_VERSION,
    algorithm: DELIVERY_ENVELOPE_ALGORITHM,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

/**
 * Opens an envelope, or throws.
 *
 * Structure, version and algorithm are checked **before** any key material is
 * touched, so a malformed row fails as a parse error rather than as a
 * cryptographic one. Authentication failure is left to GCM: `decipher.final()`
 * throws when the tag does not verify, which is exactly the tamper detection the
 * mode exists to provide, and it must never be caught and downgraded to a
 * "probably fine" result.
 */
export function openDeliveryEnvelope(key: EnvelopeKey, envelope: unknown): DeliveryPayload {
  if (!isDeliveryEnvelope(envelope)) {
    throw new Error('Delivery envelope is malformed.');
  }
  if (envelope.version !== DELIVERY_ENVELOPE_VERSION) {
    throw new Error(
      `Unsupported delivery envelope version ${String(envelope.version)}; ` +
        `this build reads version ${String(DELIVERY_ENVELOPE_VERSION)}.`,
    );
  }
  if (envelope.algorithm !== DELIVERY_ENVELOPE_ALGORITHM) {
    throw new Error(`Unsupported delivery envelope algorithm.`);
  }

  const iv = Buffer.from(envelope.iv, 'base64url');
  if (iv.length !== ENVELOPE_IV_BYTES) {
    throw new Error('Delivery envelope nonce has the wrong length.');
  }

  const decipher = createDecipheriv(CIPHER, key.bytes, iv);
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');

  const payload: unknown = JSON.parse(plaintext);
  if (!isSealedPayload(payload)) {
    throw new Error('Delivery envelope payload is malformed.');
  }
  return payload;
}

const PAYLOAD_STRING_FIELDS = [
  'originNotificationIntentId',
  'channel',
  'normalizedRecipient',
  'secret',
  'issuedAt',
  'expiresAt',
] as const;

function isSealedPayload(value: unknown): value is DeliveryPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!isDeliverySecretKind(record['secretKind'])) {
    return false;
  }
  return PAYLOAD_STRING_FIELDS.every((field) => typeof record[field] === 'string');
}
