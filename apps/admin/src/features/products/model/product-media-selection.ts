/**
 * The ordered media selection — pure operations over a list of asset ids.
 *
 * `APP2-B02` replaces the whole selection on PATCH, so the client's model is a
 * plain ordered list of distinct ids. Role is *derived from position*, never
 * stored or sent: the first entry is the THUMBNAIL and the rest are GALLERY
 * (`521:284` — Ảnh sản phẩm). `DETAIL` exists in the wider domain but is not
 * part of this contract and is never produced here.
 *
 * An empty selection is legal on a DRAFT and means it has no images. A
 * PUBLISHED product may not reach one — `APP12-M01.B2` refuses it as
 * `PRODUCT_MEDIA_NOT_PUBLISHABLE` — and the cap is
 * `MAX_PRODUCT_MEDIA_ITEMS`, which lives in `product-media-capacity` rather
 * than here so one module owns the number.
 *
 * ## The primary is anchored (`APP12-M01.D1` §H.1 — Option B)
 *
 * Position 0 is the primary, and no arrow may move an image into or out of it.
 * The alternative — letting `Di chuyển sau` on the primary promote whatever
 * was second — makes one arrow press silently rewrite the product's canonical
 * thumbnail, its `og:image` and every non-detail storefront surface. Demotion
 * is therefore reachable only through the explicit `setPrimary` below, which
 * is the action that exists to say exactly that.
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

/**
 * True when the arrow controls on the tile at `index` are operable.
 *
 * Two rules compose. The universal one — the first cannot move earlier, the
 * last cannot move later — and the anchor: the primary at position 0 offers
 * neither arrow, and position 1 may not move earlier, because doing so would
 * put it at 0 and make it the primary without the operator ever saying so.
 *
 * The result is that arrows shuffle the *gallery* and only `setPrimary`
 * changes the *primary*. Nothing here is disabled-with-a-tooltip: the primary
 * tile renders no set-primary action at all, and its arrows are programmatically
 * disabled so a keyboard operator is told rather than shown a control that
 * does nothing.
 */
export function canMoveEarlier(selection: readonly string[], index: number): boolean {
  return index >= 2 && index < selection.length;
}

export function canMoveLater(selection: readonly string[], index: number): boolean {
  return index >= 1 && index < selection.length - 1;
}

/**
 * Promotes one image to primary, preserving the relative order of every other.
 *
 * `[A,B,C,D]` with `C` chosen becomes `[C,A,B,D]` — the previous primary is
 * not swapped to where `C` was, it is pushed to position 1, because the
 * gallery's reading order is what the operator arranged and a set-primary is
 * not a request to rearrange it.
 *
 * An index that is already primary, or out of range, returns the input
 * unchanged: the caller renders no action for the primary tile, and a no-op is
 * the honest answer for a stale click rather than a thrown error.
 */
export function setPrimary(selection: readonly string[], index: number): readonly string[] {
  if (index <= 0 || index >= selection.length) {
    return selection;
  }
  const chosen = selection[index] as string;
  return [chosen, ...selection.filter((_, position) => position !== index)];
}

/**
 * Whether removing the image at `index` is allowed *before* a request exists.
 *
 * A DRAFT may be emptied; a PUBLISHED product may not, because
 * `PRODUCT_MEDIA_NOT_PUBLISHABLE` is what the server would answer and the
 * operator would learn it only after losing the round trip. The refusal is
 * therefore stated on the control (`media.publishedMinimum`) rather than
 * discovered on save — the one place this client anticipates a server rule, and
 * it anticipates it by *disabling*, never by narrowing the request it sends.
 */
export function canRemoveAt(
  selection: readonly string[],
  index: number,
  options: { readonly requiresAtLeastOne: boolean },
): boolean {
  if (index < 0 || index >= selection.length) {
    return false;
  }
  return !(options.requiresAtLeastOne && selection.length === 1);
}

/** Removes by position rather than by id, which is what a tile action knows. */
export function removeAt(selection: readonly string[], index: number): readonly string[] {
  return selection.filter((_, position) => position !== index);
}
