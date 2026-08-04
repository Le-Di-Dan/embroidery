/**
 * The `asset.normalization.requested` payload contract (`IMP-D046` PO-02).
 *
 * Same discipline as `asset.inspection.requested`: validation is **exact**, an
 * unknown field means the producer and the consumer disagree about the contract,
 * and running the job anyway would silently ignore whatever the producer thought
 * it was asking for.
 *
 * The difference from the inspection event is the whole reason `APP3-G06`
 * exists. This payload names the **association** that triggered the work, never
 * the processing profile: the profile is re-derived from that association at
 * claim time (PO-03), so a message cannot assert what it is not entitled to
 * assert. Nothing here carries a profile, an ownership claim, a storage key, a
 * URL, a session secret, a customer id or content of any kind.
 */

export const ASSET_NORMALIZATION_EVENT_TYPE = 'asset.normalization.requested';
export const ASSET_NORMALIZATION_PAYLOAD_VERSION = 1;

/** The effect-key namespace. Versioned so a v2 effect cannot collide with v1. */
const EFFECT_KEY_PREFIX = 'asset-normalization:v1:';

/**
 * RFC 9562 UUIDv7, lowercase — the shape every id column in this repository
 * uses and `@embroidery/object-storage` requires of a key segment. Checked here
 * so a malformed id is a terminal payload rejection rather than an
 * `ObjectKeyError` thrown mid-attempt.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The three association kinds `IMP-D046` PO-02 authorizes, and their id field. */
export const ASSOCIATION_REF_FIELDS = Object.freeze({
  PRODUCT_SIDE_BACKGROUND: 'productSideId',
  DESIGN_TEMPLATE_ASSET: 'designTemplateAssetId',
  DESIGN_SESSION_ASSET: 'designSessionAssetId',
} as const);

export type AssociationRefKind = keyof typeof ASSOCIATION_REF_FIELDS;

export type AssociationRef =
  | { readonly kind: 'PRODUCT_SIDE_BACKGROUND'; readonly productSideId: string }
  | { readonly kind: 'DESIGN_TEMPLATE_ASSET'; readonly designTemplateAssetId: string }
  | { readonly kind: 'DESIGN_SESSION_ASSET'; readonly designSessionAssetId: string };

export interface AssetNormalizationPayload {
  readonly schemaVersion: typeof ASSET_NORMALIZATION_PAYLOAD_VERSION;
  readonly assetId: string;
  readonly normalizationPolicyVersion: number;
  readonly associationRef: AssociationRef;
}

export type AssetNormalizationPayloadResult =
  | { readonly valid: true; readonly payload: AssetNormalizationPayload }
  | {
      readonly valid: false;
      readonly errorClass: 'JOB_PAYLOAD_INVALID' | 'JOB_SCHEMA_UNSUPPORTED';
    };

const INVALID = { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' } as const;

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'schemaVersion',
  'assetId',
  'normalizationPolicyVersion',
  'associationRef',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  if (Object.keys(record).length !== allowed.size) return false;
  return Object.keys(record).every((key) => allowed.has(key));
}

/**
 * Parses one `associationRef`.
 *
 * The discriminator selects exactly one id field and nothing else is tolerated,
 * so a message cannot smuggle a second reference alongside the one it declares —
 * which is how a caller would otherwise get to choose which association the
 * worker validated against.
 */
function parseAssociationRef(raw: unknown): AssociationRef | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(kind in ASSOCIATION_REF_FIELDS)) return undefined;

  const field = ASSOCIATION_REF_FIELDS[kind as AssociationRefKind];
  if (!exactKeys(raw, new Set(['kind', field]))) return undefined;

  const id = raw[field];
  if (typeof id !== 'string' || !UUID_V7_PATTERN.test(id)) return undefined;

  return { kind, [field]: id } as AssociationRef;
}

/**
 * Parses the raw JSONB payload.
 *
 * A wrong `schemaVersion` is `JOB_SCHEMA_UNSUPPORTED` rather than
 * `JOB_PAYLOAD_INVALID`: both are terminal, but only the first tells an operator
 * the producer is ahead of (or behind) this deployment. A wrong
 * `normalizationPolicyVersion` is the same class of fact for the same reason —
 * the producer asked for rules this build does not implement.
 */
export function parseAssetNormalizationPayload(
  raw: unknown,
  envelopeSchemaVersion: number,
): AssetNormalizationPayloadResult {
  if (envelopeSchemaVersion !== ASSET_NORMALIZATION_PAYLOAD_VERSION) {
    return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
  }
  if (!isRecord(raw) || !exactKeys(raw, ALLOWED_KEYS)) {
    return INVALID;
  }
  if (raw['schemaVersion'] !== ASSET_NORMALIZATION_PAYLOAD_VERSION) {
    return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
  }
  const assetId = raw['assetId'];
  if (typeof assetId !== 'string' || !UUID_V7_PATTERN.test(assetId)) {
    return INVALID;
  }
  const policyVersion = raw['normalizationPolicyVersion'];
  if (typeof policyVersion !== 'number' || !Number.isInteger(policyVersion)) {
    return INVALID;
  }
  const associationRef = parseAssociationRef(raw['associationRef']);
  if (associationRef === undefined) {
    return INVALID;
  }
  return {
    valid: true,
    payload: {
      schemaVersion: ASSET_NORMALIZATION_PAYLOAD_VERSION,
      assetId,
      normalizationPolicyVersion: policyVersion,
      associationRef,
    },
  };
}

/**
 * The durable effect's identity (`IMP-D046` PO-08).
 *
 * Asset plus policy version, deliberately **without** the association: several
 * associations may legitimately reference one Asset, and keying the effect by
 * association would produce a derivative per association for bytes that are
 * identical. The association authorizes the request; it does not multiply the
 * result.
 */
export function deriveAssetNormalizationEffectKey(payload: AssetNormalizationPayload): string {
  return `${EFFECT_KEY_PREFIX}${payload.assetId}:${String(payload.normalizationPolicyVersion)}`;
}

/**
 * The id the association reference names, whichever kind it is.
 *
 * Switched rather than indexed: a computed index over a discriminated union
 * loses the discrimination, and the only way to make it compile would be a cast
 * that would also accept a reference carrying the wrong field.
 */
export function associationIdOf(reference: AssociationRef): string {
  switch (reference.kind) {
    case 'PRODUCT_SIDE_BACKGROUND':
      return reference.productSideId;
    case 'DESIGN_TEMPLATE_ASSET':
      return reference.designTemplateAssetId;
    case 'DESIGN_SESSION_ASSET':
      return reference.designSessionAssetId;
  }
}
