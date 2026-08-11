/**
 * Which intake lane an Asset belongs to, and what inspecting it produces
 * (`APP3-S06`).
 *
 * Until this checkpoint the inspection pipeline had exactly one customer.
 * `asset-rows.ts` compared every row against two literals — `CATALOG_MEDIA` and
 * `PRODUCTION_SENSITIVE` — and refused everything else as "not private catalog
 * media". Its own comment named the case it was refusing: a `CUSTOMER_UPLOAD`
 * "is pointed at work belonging to a different pipeline with different privacy
 * rules". That different pipeline was never built, so a Design Session upload's
 * inspection job raised a contradiction, dead-lettered, and left the Asset in
 * `INSPECTING` permanently — with `APP3-W01C` correctly waiting for a verdict
 * that could not arrive. `APP3-B06C` measured it end to end and recorded it as
 * `FU-APP3-B06C-SESSION-LANE-INSPECTION-01`; this is where it closes.
 *
 * ## Parameterized, not copied
 *
 * A second inspection use case would be a second definition of what a safe
 * decode is, and the two would drift the first time either was touched. So the
 * lane is a *value* the existing pipeline reads, and it changes exactly one
 * thing: which derivatives inspection is expected to produce.
 *
 * The catalog lane keeps `THUMBNAIL` + `CATALOG_PREVIEW` — store-owned marketing
 * media, exactly as `APP2-W01` fixed them.
 *
 * The Session lane produces **none**. That is the whole difference and it is
 * deliberate:
 *
 * - A `THUMBNAIL` or `CATALOG_PREVIEW` of a customer's private upload is
 *   catalogue media derived from something that is not catalogue media. Nothing
 *   would ever serve it — `APP3-B06C` delivers `NORMALIZED` only — so it would
 *   be private bytes written, stored and retained for no reader at all.
 * - The editor-safe output a Session upload actually needs is `NORMALIZED`, and
 *   it is already owned by `APP3-W01A` under `IMP-D044`'s `SESSION_UPLOAD`
 *   profile, driven by the `asset.normalization.requested` event `APP3-B06B`
 *   already emits. Producing it here would be a second producer of the same
 *   derivative kind.
 *
 * So inspection on this lane answers exactly one question — is this file a safe,
 * decodable raster? — and the answer moves the Asset `INSPECTING → ACCEPTED` or
 * `INSPECTING → REJECTED`. `APP3-W01C`'s already-accepted retry then observes
 * `ACCEPTED` and the *same* normalization work converges. No second event, no
 * second queue, no scheduler and no waiting inside an attempt.
 */
import type { DerivativeOutputPolicy } from './asset-processing-policy';
import { DERIVATIVE_OUTPUT_POLICIES } from './asset-processing-policy';

export const INSPECTION_LANE_CODES = ['CATALOG', 'SESSION'] as const;
export type InspectionLaneCode = (typeof INSPECTION_LANE_CODES)[number];

export interface AssetInspectionLane {
  readonly code: InspectionLaneCode;
  /** The `assets.kind` this lane owns. */
  readonly assetKind: string;
  /** The `assets.classification` this lane owns. */
  readonly classification: string;
  /**
   * The derivatives inspection itself writes, in generation order.
   *
   * Empty is a legitimate value, not a gap: see the file docblock.
   */
  readonly derivatives: readonly DerivativeOutputPolicy[];
}

/**
 * Store-owned marketing media (`APP2-W01`). Unchanged in every respect —
 * the same pair of outputs, in the same order, from the same policy objects.
 */
export const CATALOG_INSPECTION_LANE: AssetInspectionLane = Object.freeze({
  code: 'CATALOG',
  assetKind: 'CATALOG_MEDIA',
  classification: 'PRODUCTION_SENSITIVE',
  derivatives: DERIVATIVE_OUTPUT_POLICIES,
});

/**
 * An anonymous Design Session's own upload (`APP3-B06B`, `IMP-D044` PO-05).
 *
 * The pair is exactly what `APP3-B06B` writes and what `APP3-B06C` re-checks
 * before delivering a byte, so all three agree on one definition of the lane.
 */
export const SESSION_INSPECTION_LANE: AssetInspectionLane = Object.freeze({
  code: 'SESSION',
  assetKind: 'CUSTOMER_UPLOAD',
  classification: 'CUSTOMER_PRIVATE',
  derivatives: Object.freeze([]),
});

const LANES: readonly AssetInspectionLane[] = Object.freeze([
  CATALOG_INSPECTION_LANE,
  SESSION_INSPECTION_LANE,
]);

/**
 * The lane an Asset row belongs to, or `undefined` when it belongs to none.
 *
 * Matched on the **pair**, never on the kind alone. A `CUSTOMER_UPLOAD` row that
 * somehow carried `PUBLIC` is not a Session upload with an odd classification —
 * it is a row no delivered checkpoint can produce, and inspecting it under
 * either lane's privacy assumptions is exactly the mistake the original
 * two-literal check existed to prevent.
 */
export function resolveInspectionLane(
  kind: string,
  classification: string,
): AssetInspectionLane | undefined {
  return LANES.find((lane) => lane.assetKind === kind && lane.classification === classification);
}

/** The derivative kinds a lane's inspection owns. Empty for the Session lane. */
export function laneDerivativeKinds(lane: AssetInspectionLane): readonly string[] {
  return lane.derivatives.map((policy) => policy.kind);
}

/**
 * Whether inspection has to decode every pixel explicitly.
 *
 * **Derived, never declared.** True exactly when the lane writes no derivative,
 * because generating a derivative already *is* a full decode: the catalog lane's
 * pixel-level verification has always been a side effect of producing its two
 * outputs under `failOn: 'warning'`.
 *
 * The Session lane produces nothing, so on that lane the free decode disappears
 * — and a file with a valid header and truncated pixel data would be accepted by
 * a pipeline that had only read its header. `APP3-S06` found exactly that with a
 * real fixture. Deriving the answer from `derivatives.length` rather than
 * carrying a flag is what stops a future lane that writes no output from
 * silently inheriting the weaker check: there is no field anyone can forget to
 * set.
 */
export function requiresFullDecodeVerification(lane: AssetInspectionLane): boolean {
  return lane.derivatives.length === 0;
}
