/**
 * What the inspector and preview are currently pointed at.
 *
 * Addressed by local draft `key`, never by server `id`: a newly added row has
 * no id yet, and a selection that could not name it would collapse the moment
 * the operator created the row they were about to edit.
 */
export type PlacementSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'side'; readonly sideKey: string }
  | { readonly kind: 'area'; readonly sideKey: string; readonly areaKey: string };

export const NO_SELECTION: PlacementSelection = { kind: 'none' };

/**
 * The side the preview should draw.
 *
 * Both an area selection and a side selection resolve to a side, because an
 * area is only meaningful on the canvas it sits in.
 */
export function selectedSideKey(selection: PlacementSelection): string | null {
  return selection.kind === 'none' ? null : selection.sideKey;
}
