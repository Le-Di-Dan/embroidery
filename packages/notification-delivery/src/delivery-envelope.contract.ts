/**
 * The encrypted delivery-envelope contract (`APP4-B01`, `ADR-APP4-001` §6.4).
 *
 * Two shapes, and the distinction between them is the whole security model:
 *
 * - **`DeliveryEnvelope`** is what reaches `outbox_events.payload`. It carries
 *   ciphertext and the metadata needed to open it, and nothing a reader could
 *   use without the key.
 * - **`DeliveryPayload`** is what the ciphertext protects. It never exists at
 *   rest and never leaves this package except through `openDeliveryEnvelope`.
 *
 * This module holds the version constant **once**. `apps/api` and `apps/worker`
 * both import it from here rather than declaring their own, so an envelope
 * cannot be sealed under one version and read under another.
 */

/** `ADR-APP4-001` §6.4 — envelope version. One constant, one owner. */
export const DELIVERY_ENVELOPE_VERSION = 1;

/** `ADR-APP4-001` §6.3 — the AEAD construction, from `node:crypto`. */
export const DELIVERY_ENVELOPE_ALGORITHM = 'AES-256-GCM';

/** `ADR-APP4-001` §6.4 — the closed secret-kind discriminator. */
export const DELIVERY_SECRET_KINDS = ['VERIFICATION_CODE', 'SECURE_LINK_TOKEN'] as const;

export type DeliverySecretKind = (typeof DELIVERY_SECRET_KINDS)[number];

export function isDeliverySecretKind(value: unknown): value is DeliverySecretKind {
  return typeof value === 'string' && (DELIVERY_SECRET_KINDS as readonly string[]).includes(value);
}

/**
 * The plaintext the envelope protects — the minimum a delivery needs.
 *
 * `originNotificationIntentId` is **lineage only** (`ADR-APP4-001` §6.5). On the
 * original delivery it equals the current intent; on an `APP4-B08` manual replay
 * the ciphertext is copied byte-identically, so it keeps naming the *original*
 * failed intent while the new outbox event's aggregate linkage names the replay
 * intent. A consumer that treats this field as the current execution identity
 * works perfectly until the first replay and is wrong from then on — which is
 * why the current intent is read from the outbox linkage instead.
 */
export type DeliveryPayload = {
  readonly secretKind: DeliverySecretKind;
  /** Immutable lineage reference. **Never** the mutable execution target. */
  readonly originNotificationIntentId: string;
  readonly channel: string;
  /** The real destination. Exists only inside the ciphertext. */
  readonly normalizedRecipient: string;
  /** The one raw code or token. Exists only inside the ciphertext. */
  readonly secret: string;
  /** ISO-8601. */
  readonly issuedAt: string;
  /** ISO-8601. */
  readonly expiresAt: string;
};

/**
 * The persisted outer envelope.
 *
 * Binary fields are base64url (`ADR-APP4-001` §6.4) — the encoding the secure
 * link already uses, so one convention covers both.
 */
export type DeliveryEnvelope = {
  readonly version: number;
  readonly algorithm: string;
  /** 96-bit nonce, base64url. Fresh for every seal. */
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
};

/** The fields a well-formed envelope must carry, for structural validation. */
const ENVELOPE_FIELDS = ['version', 'algorithm', 'iv', 'ciphertext', 'authTag'] as const;

export function isDeliveryEnvelope(value: unknown): value is DeliveryEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['version'] !== 'number') {
    return false;
  }
  return ENVELOPE_FIELDS.slice(1).every((field) => typeof record[field] === 'string');
}
