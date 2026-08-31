/**
 * The ordered image selection — pure operations over a list of asset ids.
 *
 * ## Replacement, not append
 *
 * `adminGalleryEntry_replaceAssets` stores the **complete intended selection**:
 * any image absent from the array is detached, and the array order becomes the
 * display order with position 0 as the cover. So the client's model is exactly
 * that — one ordered list of distinct ids — and a save always sends the whole
 * of it. There is no per-image attach, no per-image detach and no partial
 * write, which is why nothing here produces a delta.
 *
 * An empty list is a legal authoring state: it clears the selection. Publication
 * then refuses until at least one eligible image is attached, and that refusal
 * belongs to the publication panel, not to this model.
 *
 * ## The cover is position 0, and it is not a flag
 *
 * "Set as cover" is a move to the front, not a field. Storing a separate
 * `isCover` would create a second source of truth the server does not have, and
 * the first row is already what the public gallery and the Open Graph image use.
 *
 * ## Nothing here sorts
 *
 * The order on screen *is* the order sent. A client-side sort would put the
 * visible arrangement out of step with what a save would persist, which is the
 * one thing an ordering control must never do.
 */
import type { AdminGalleryEntryAssetResponse } from '@embroidery/api-client';

/**
 * The authoritative selection as ordered ids.
 *
 * The response is already ordered, but `position` is honoured explicitly rather
 * than trusted implicitly, and duplicates are collapsed so the client never
 * holds a list the server would refuse.
 */
export function selectionFromDetailAssets(
  assets: readonly AdminGalleryEntryAssetResponse[],
): readonly string[] {
  const ordered = [...assets].sort((a, b) => a.position - b.position);
  return dedupeAssetIds(ordered.map((item) => item.assetId));
}

/** First occurrence wins; order is otherwise untouched. */
export function dedupeAssetIds(assetIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of assetIds) {
    if (typeof id !== 'string' || id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Moves one entry by `offset`. An out-of-range move returns the input
 * unchanged, so a caller can bind the control unconditionally and disable it
 * from `canMoveAsset` — which is what the approved frame shows (the first row's
 * "Di chuyển trước" disabled, the last row's "Di chuyển sau" disabled).
 */
export function moveAsset(
  selection: readonly string[],
  index: number,
  offset: number,
): readonly string[] {
  const target = index + offset;
  if (index < 0 || index >= selection.length || target < 0 || target >= selection.length) {
    return selection;
  }
  const next = [...selection];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as string);
  return next;
}

export function canMoveAsset(selection: readonly string[], index: number, offset: number): boolean {
  const target = index + offset;
  return index >= 0 && index < selection.length && target >= 0 && target < selection.length;
}

/** Promotes one entry to position 0 — which is what "cover" means here. */
export function promoteAssetToCover(
  selection: readonly string[],
  index: number,
): readonly string[] {
  return moveAsset(selection, index, -index);
}

/**
 * Removes one entry. This detaches the image from the entry and nothing more —
 * the asset, its renditions and the stored objects are untouched, and no
 * asset-scoped operation is called from here. There is no deletion operation on
 * this boundary to call even if one were wanted (`FU-APP11-B03A-01`).
 */
export function removeAsset(selection: readonly string[], assetId: string): readonly string[] {
  return selection.filter((id) => id !== assetId);
}

/** Appends ids that are not already selected, preserving both orders. */
export function addAssets(
  selection: readonly string[],
  assetIds: readonly string[],
): readonly string[] {
  return dedupeAssetIds([...selection, ...assetIds]);
}

/**
 * True when the selection differs from the authoritative one — by membership or
 * by order.
 *
 * This is what gates the media save: an unchanged selection must not be sent,
 * because sending it would advance the entry's concurrency token and rewrite
 * the whole ordered set for no reason.
 */
export function hasSelectionChanged(
  initial: readonly string[],
  current: readonly string[],
): boolean {
  if (initial.length !== current.length) {
    return true;
  }
  return initial.some((id, index) => id !== current[index]);
}
