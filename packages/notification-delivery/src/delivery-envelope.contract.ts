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
 * Which secure-link landing a `SECURE_LINK_TOKEN` opens (`APP12-S03-C1`).
 *
 * A secure link is not one destination. `secure_access_grants.scope_kind` has
 * two closed values and each opens a different Storefront surface: a
 * `REQUEST_ACCESS` token authorizes the custom-request status page, an
 * `ORDER_ACCESS` token authorizes the Ready-Made order page, and each surface
 * refuses the other scope's token with the one indistinguishable
 * `SECURE_LINK_UNAVAILABLE`. One landing path for both therefore delivered a
 * whole class of real customers a link their own token could not open.
 *
 * ### Why the landing travels inside the ciphertext
 *
 * The worker composes the URL, and `APP4-W01` deliberately consults **no**
 * grant or challenge table: the business validity of a secret belongs to the
 * checkpoint that issued it, and a delivery job that queried two domains to
 * learn what it was carrying would couple transport to both. So the fact is
 * decided once, on the issuing side, from the persisted grant row — and it
 * rides inside the sealed payload, where it is unreadable at rest and cannot
 * be supplied by anything downstream.
 *
 * ### Why it is named for the scope and not for the path
 *
 * A path is Storefront routing and moves with the Storefront; the scope is the
 * authorization fact, and it is what the issuing side actually knows. The
 * worker maps one onto the other in a closed table, so no arbitrary path string
 * ever crosses this boundary and a third scope cannot be added without an
 * explicit landing decision.
 */
export const SECURE_LINK_LANDINGS = ['REQUEST_ACCESS', 'ORDER_ACCESS'] as const;

export type SecureLinkLanding = (typeof SECURE_LINK_LANDINGS)[number];

export function isSecureLinkLanding(value: unknown): value is SecureLinkLanding {
  return typeof value === 'string' && (SECURE_LINK_LANDINGS as readonly string[]).includes(value);
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
  /**
   * Which landing a `SECURE_LINK_TOKEN` opens (`APP12-S03-C1`).
   *
   * Mandatory for a secure link and refused for a verification code —
   * {@link sealDeliveryEnvelope} enforces both, so no link can be sealed
   * without a landing and no code can carry one.
   *
   * Optional in the *type* only, and only so that an envelope sealed before
   * this field existed still opens: an `APP4-B08` manual replay copies
   * historical ciphertext byte-identically, and a required field would turn
   * every one of those into `NOTIFICATION_ENVELOPE_UNREADABLE`. A link that
   * arrives without a landing is refused at **rendering** time instead, where
   * the refusal can name what is actually missing.
   */
  readonly secureLinkLanding?: SecureLinkLanding;
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
