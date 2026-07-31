/**
 * The ordered media selection — pure operations over a list of asset ids.
 *
 * `APP2-B02` replaces the whole selection on PATCH, so the client's model is a
 * plain ordered list of distinct ids. Role is *derived from position*, never
 * stored or sent: the first entry is the THUMBNAIL and the rest are GALLERY
 * (`521:284` — Ảnh sản phẩm). `DETAIL` exists in the wider domain but is not
 * part of this contract and is never produced here.
 *
 * There is no arbitrary maximum. An empty selection is legal and means the
 * draft has no images.
 */
import { AdminProductMediaResponseRole } from '@embroidery/api-client';
import type { AdminProductMediaResponse } from '@embroidery/api-client';

/** Role derived from position, matching the server's own derivation. */
export type ProductMediaRole =
  (typeof AdminProductMediaResponseRole)[keyof typeof AdminProductMediaResponseRole];

export function roleForPosition(index: number): ProductMediaRole {
  return index === 0
    ? AdminProductMediaResponseRole.THUMBNAIL
    : AdminProductMediaResponseRole.GALLERY;
}

/**
 * The authoritative selection as ordered ids. The response is already ordered;
 * `position` is honoured explicitly rather than trusted implicitly, and
 * duplicates are collapsed so the client never sends a list the server would
 * reject.
 */
export function selectionFromDetailMedia(
  media: readonly AdminProductMediaResponse[],
): readonly string[] {
  const ordered = [...media].sort((a, b) => a.position - b.position);
  return dedupe(ordered.map((item) => item.assetId));
}

/** First occurrence wins; order is otherwise untouched. */
export function dedupe(assetIds: readonly string[]): readonly string[] {
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
 * Moves one entry by `offset`. Out-of-range moves return the input unchanged so
 * the caller can bind the control unconditionally and disable it from
 * `canMove`, which is what the approved frames show (first row's
 * "Di chuyển trước" disabled, last row's "Di chuyển sau" disabled).
 */
export function moveSelection(
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

export function canMove(selection: readonly string[], index: number, offset: number): boolean {
  const target = index + offset;
  return index >= 0 && index < selection.length && target >= 0 && target < selection.length;
}

/**
 * Removes one entry. This unlinks the image from the product and nothing more —
 * the asset, its derivatives and the stored objects are untouched, and no
 * asset-scoped operation is ever called from here.
 */
export function removeFromSelection(
  selection: readonly string[],
  assetId: string,
): readonly string[] {
  return selection.filter((id) => id !== assetId);
}

/** Appends ids that are not already selected, preserving both orders. */
export function addToSelection(
  selection: readonly string[],
  assetIds: readonly string[],
): readonly string[] {
  return dedupe([...selection, ...assetIds]);
}

/**
 * True when the selection differs from the authoritative one — by membership or
 * by order. This is what gates `mediaAssetIds` onto the PATCH body: an
 * unchanged selection must not be sent, because sending it would rewrite the
 * whole ordered set for no reason.
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
