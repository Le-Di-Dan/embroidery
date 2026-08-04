/**
 * The `asset.normalization.requested` event contract (`IMP-D046`, `APP3-B01N`).
 *
 * One event crosses two applications: the API appends it in the transaction that
 * creates or changes an Asset association, and the worker consumes it. Two
 * independent declarations of the same string and the same two version numbers
 * would drift silently — the producer would keep writing a payload the consumer
 * had stopped accepting, and nothing would fail until a derivative quietly never
 * appeared. So the vocabulary has exactly one owner, here, and both applications
 * import it.
 *
 * What lives here is deliberately only the **shape**: the event name, the two
 * versions, the association discriminator and a pure builder. Runtime parsing
 * and exact-key validation stay with the consumer (`APP3-W01A`), because
 * rejecting a message is the consumer's judgement to make — a producer that
 * validated its own output would only ever agree with itself.
 *
 * Nothing here reads a database, opens a transaction or knows what a profile is.
 * The profile is re-derived from the association at claim time (`IMP-D046`
 * PO-03) and must never appear in a payload.
 */

/** The event type, as written to `outbox_events.event_type`. */
export const ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE = 'asset.normalization.requested';

/** The payload schema version, mirrored into `payload_schema_version`. */
export const ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION = 1;

/**
 * The normalization policy version the producer is asking for.
 *
 * Distinct from the schema version on purpose: the message shape and the rules
 * that turn bytes into an editor-safe derivative move independently, and a
 * consumer that implements neither answers with a different error class for
 * each.
 */
export const ASSET_NORMALIZATION_POLICY_VERSION = 1;

/** The three association kinds `IMP-D046` PO-02 authorizes, and their id field. */
export const ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS = Object.freeze({
  PRODUCT_SIDE_BACKGROUND: 'productSideId',
  DESIGN_TEMPLATE_ASSET: 'designTemplateAssetId',
  DESIGN_SESSION_ASSET: 'designSessionAssetId',
} as const);

export type AssetNormalizationAssociationKind =
  keyof typeof ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS;

/**
 * The association that authorizes the work, never the work's parameters.
 *
 * Discriminated so exactly one id field is present: a reference carrying two
 * would let the producer choose which association the consumer validated
 * against, which is the one thing the association is there to prevent.
 */
export type AssetNormalizationAssociationRef =
  | { readonly kind: 'PRODUCT_SIDE_BACKGROUND'; readonly productSideId: string }
  | { readonly kind: 'DESIGN_TEMPLATE_ASSET'; readonly designTemplateAssetId: string }
  | { readonly kind: 'DESIGN_SESSION_ASSET'; readonly designSessionAssetId: string };

export interface AssetNormalizationRequestedPayload {
  readonly schemaVersion: typeof ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION;
  readonly assetId: string;
  readonly normalizationPolicyVersion: number;
  readonly associationRef: AssetNormalizationAssociationRef;
}

/**
 * Builds one payload. Pure, total, and the only way a producer should make one.
 *
 * Both versions are supplied by this function rather than by the caller, so a
 * producer cannot announce a schema or a policy it is not compiled against — and
 * cannot add a field, because there is no parameter that would carry one.
 */
export function buildAssetNormalizationRequestedPayload(input: {
  readonly assetId: string;
  readonly associationRef: AssetNormalizationAssociationRef;
}): AssetNormalizationRequestedPayload {
  return {
    schemaVersion: ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
    assetId: input.assetId,
    normalizationPolicyVersion: ASSET_NORMALIZATION_POLICY_VERSION,
    associationRef: input.associationRef,
  };
}
