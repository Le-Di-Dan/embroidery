/**
 * The `asset.inspection.requested` payload contract (APP2-W01 §10).
 *
 * The producer is `APP2-B01` Tx B, which appends exactly
 * `{schemaVersion, assetId}` and nothing else — the worker reads the asset row
 * for every other fact, so nothing in the payload can go stale between the
 * append and the claim, and nothing PII-bearing is ever in the queue.
 *
 * Validation is **exact**, not tolerant. An unknown field means the producer
 * and the consumer disagree about the contract, and running the job anyway
 * would silently ignore whatever the producer thought it was asking for.
 */

export const ASSET_INSPECTION_EVENT_TYPE = 'asset.inspection.requested';
export const ASSET_INSPECTION_PAYLOAD_VERSION = 1;

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'asset-inspection:v1:';

/**
 * RFC 9562 UUIDv7, lowercase — the same shape `@embroidery/object-storage`
 * requires of a key segment, checked here so a malformed id is a terminal
 * payload rejection rather than an `ObjectKeyError` thrown mid-attempt.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ALLOWED_KEYS: ReadonlySet<string> = new Set(['schemaVersion', 'assetId']);

export interface AssetInspectionPayload {
  readonly schemaVersion: typeof ASSET_INSPECTION_PAYLOAD_VERSION;
  readonly assetId: string;
}

export type AssetInspectionPayloadResult =
  | { readonly valid: true; readonly payload: AssetInspectionPayload }
  | {
      readonly valid: false;
      readonly errorClass: 'JOB_PAYLOAD_INVALID' | 'JOB_SCHEMA_UNSUPPORTED';
    };

const INVALID = { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' } as const;

/**
 * Parses the raw JSONB payload.
 *
 * A wrong `schemaVersion` is `JOB_SCHEMA_UNSUPPORTED` rather than
 * `JOB_PAYLOAD_INVALID`: the two are both terminal, but only the first tells an
 * operator the producer is ahead of (or behind) this deployment.
 */
export function parseAssetInspectionPayload(
  raw: unknown,
  envelopeSchemaVersion: number,
): AssetInspectionPayloadResult {
  if (envelopeSchemaVersion !== ASSET_INSPECTION_PAYLOAD_VERSION) {
    return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return INVALID;
  }

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return INVALID;
    }
  }
  if (Object.keys(record).length !== ALLOWED_KEYS.size) {
    return INVALID;
  }

  const { schemaVersion, assetId } = record;
  if (schemaVersion !== ASSET_INSPECTION_PAYLOAD_VERSION) {
    return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
  }
  if (typeof assetId !== 'string' || !UUID_V7_PATTERN.test(assetId)) {
    return INVALID;
  }

  return {
    valid: true,
    payload: { schemaVersion: ASSET_INSPECTION_PAYLOAD_VERSION, assetId },
  };
}

/**
 * The durable effect's identity.
 *
 * A pure function of the asset — deliberately *not* of the outbox event id or
 * the attempt number. Two events asking to inspect the same asset describe one
 * effect, and the key has to say so.
 */
export function deriveAssetInspectionEffectKey(payload: AssetInspectionPayload): string {
  return `${EFFECT_KEY_PREFIX}${payload.assetId}`;
}
