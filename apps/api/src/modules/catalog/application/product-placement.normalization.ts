/**
 * Which Side background associations one placement replace scheduled
 * (`APP3-B01N`; IMP-D046 PO-04).
 *
 * Pure, and deliberately derived from the **plan** rather than from the request.
 * The plan already answered the only question that matters — `changedSideFields`
 * omits `backgroundAssetId` when the requested Asset is the one already stored —
 * so reading it here means a no-op save, a rename, a reorder, an Area edit and a
 * geometry edit all produce nothing without any of those cases being enumerated.
 * A second comparison against the request would be a second opinion about what
 * changed, and the two would eventually disagree.
 *
 * A retirement schedules nothing. Nothing is ever scheduled for the Asset that
 * was replaced, and the derivative it already has is never touched: several
 * Sides, Templates and Sessions may reference one Asset, and a placement edit
 * has no standing to decide that a shared derivative is now unwanted.
 */
import type { SidePlan } from './product-placement.plan';

/** One association the transaction created or repointed. */
export interface SideNormalizationIntent {
  readonly productSideId: string;
  readonly assetId: string;
}

/**
 * The intents for one plan, in the order the plan writes its rows.
 *
 * Created Sides first, then repointed ones, each in the order the request listed
 * them — the same order `apply` uses, so the events a transaction commits are a
 * deterministic function of the accepted request rather than of map iteration.
 */
export function planSideNormalizationRequests(sides: SidePlan): readonly SideNormalizationIntent[] {
  const intents: SideNormalizationIntent[] = [];

  for (const side of sides.created) {
    intents.push({ productSideId: side.id, assetId: side.backgroundAssetId });
  }
  for (const side of sides.updated) {
    const next = side.fields.backgroundAssetId;
    // Absent means the stored background survived this save untouched, whatever
    // else about the Side changed.
    if (next !== undefined) intents.push({ productSideId: side.id, assetId: next });
  }

  return intents;
}
