/**
 * The customer-safe projection of a design under review (`APP6-B10` §8).
 *
 * A transport-free view type, so the query decides what a customer may see and
 * the controller decides only how to serialise it — the split `APP6-B04`'s
 * `CustomerQuotationView` established for the same surface.
 *
 * ### What is here
 *
 * The exact version identity, the persisted document and the hash `APP6-B09`
 * stored, plus the effective agreement set an approval will bind. That is the
 * whole of what `APP6-S02` renders and the whole of what `APP6-B11` will be
 * asked to submit back.
 *
 * ### What is absent, and why each one
 *
 * - no `designCaseId` — the case is an internal thread id the customer has no
 *   use for and no route accepts;
 * - no `status` — the only version this view can describe is `SENT_FOR_REVIEW`,
 *   so a field for it could never vary;
 * - no `parentVersionId`, no superseded ids, no review history — the customer
 *   decides on one version, and a lineage would publish how many times the
 *   workshop has revised their design;
 * - no placement, no product, variant, side or area id, and no physical
 *   dimensions — `APP6-S02` renders the Design Document through the APP3 native
 *   SVG renderer, which needs the document and nothing else, and the geometry is
 *   already frozen inside it;
 * - no storage key, bucket, provider URL, derivative id, preview hash or asset
 *   id — B10 exposes no bytes at all, publishes no asset-by-id route and creates
 *   no derivative;
 * - no customer id, contact, grant id, token, digest or step-up challenge — the
 *   grant authorised this read and is never echoed by it;
 * - no Approval Snapshot and no acceptance record — those are `APP6-B11`'s, and
 *   a field here would be a surface for them to leak through before they exist.
 *
 * `accessExpiresAt` is the one grant-derived fact carried across, exactly as
 * `APP6-B04` carries it: the page needs to tell the customer when their link
 * stops working, and it is a timestamp, not a credential.
 */
import type { EffectiveAgreementView } from './effective-agreements.reader';

export interface CustomerDesignReviewView {
  readonly designVersionId: string;
  /** Monotonic within the design case. Display only; never an input anywhere. */
  readonly version: number;
  readonly documentSchemaVersion: number;
  /** The stored `APP6-B09` hash, straight from the row. Never recomputed here. */
  readonly documentHash: string;
  readonly sentAt: Date;
  /** The persisted Design Document — v1 or v2, unmigrated and unrewritten. */
  readonly document: unknown;
  /** The complete required set, in the policy's published type order. */
  readonly agreements: readonly EffectiveAgreementView[];
  readonly accessExpiresAt: Date;
}
