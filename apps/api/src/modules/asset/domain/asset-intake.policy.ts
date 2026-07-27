/**
 * The locked APP2 intake policy (`APP2-B01-G01`, `ADR-APP2-001` §4.2f / §7).
 *
 * These are approved product values, not tuning knobs: the Product Owner fixed
 * them at the entry gate and `APP2-B01` implements them. They live in one
 * module so the parser, the service, the codecs and the tests all read the same
 * number — a second copy is how a 25 MiB limit silently becomes two limits.
 *
 * The API byte counter is **authoritative**; the gateway's 27 MiB ceiling only
 * protects the multipart envelope and is enforced by Nginx, not here.
 */

/** 25 MiB. The authoritative maximum for the uploaded file part. */
export const MAX_UPLOAD_BYTES = 26_214_400;

/** The whole request may not outlive this, however slowly the client streams. */
export const UPLOAD_HARD_DURATION_MS = 300_000;

/** How long a pre-stream allocation stays owned before another claim may reclaim it. */
export const ALLOCATION_TTL_MS = 900_000;

/** The closed raster allowlist. SVG and every other type is rejected. */
export const ACCEPTED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

export function isAcceptedMediaType(value: string): value is AcceptedMediaType {
  return (ACCEPTED_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * APP2 product media is `CATALOG_MEDIA` — the canonical `ASSET_KINDS` value.
 * The gate recorded this: the product term "product image" has no persisted
 * counterpart, and inventing one would break `ck_assets__kind_allowed`.
 */
export const INTAKE_ASSET_KIND = 'CATALOG_MEDIA' as const;

/**
 * Intake is never `PUBLIC` (INV-09): public visibility is reached only through
 * a publication flow, so the client cannot select this value at all.
 */
export const INTAKE_CLASSIFICATION = 'PRODUCTION_SENSITIVE' as const;

/** The multipart field and file part names, in their required arrival order. */
export const UPLOAD_FIELD_ASSET_KIND = 'assetKind';
export const UPLOAD_FIELD_CLASSIFICATION = 'classification';
export const UPLOAD_FILE_PART = 'file';

/** The idempotency namespace for this operation family. */
export const UPLOAD_OPERATION_NAMESPACE = 'admin.asset.upload';

/** The outbox event type the Tx B inspection intent carries. */
export const ASSET_INSPECTION_EVENT_TYPE = 'asset.inspection.requested';

/** Payload schema version of that event. */
export const ASSET_INSPECTION_PAYLOAD_VERSION = 1;
