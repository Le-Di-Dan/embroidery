/**
 * The Studio route's selection state, as one reducer (`APP3-S01`).
 *
 * Side, Area and Template are not three independent choices. A Template is
 * compatible with exactly one `product → side → area` triple, and an Area
 * belongs to exactly one Side, so changing a Side invalidates both of the
 * others. Expressing that as a reducer makes the cascade **structural**: there
 * is no transition that can set a new Side and leave the old Area or the old
 * Template behind, because every transition is written here and every one of
 * them derives the whole state at once.
 *
 * The alternative — three `useState`s and an effect that clears the others —
 * fails the same way every time: the intermediate render, in which a new Side
 * is on screen beside the previous Side's Template, actually exists. That was
 * the lesson of `APP3-A03-C1`, and it is why nothing here clears a field after
 * the fact.
 */
import type { PublicProductPlacementResponse } from '@embroidery/api-client';

import { findArea, findSide, initialAreaOf, initialSideOf } from './studio-placement';

export interface StudioSelection {
  readonly sideId: string | null;
  readonly areaId: string | null;
  readonly templateSlug: string | null;
}

/** Before a manifest has arrived nothing is selected — and nothing is guessed. */
export const EMPTY_STUDIO_SELECTION: StudioSelection = {
  sideId: null,
  areaId: null,
  templateSlug: null,
};

export type StudioSelectionAction =
  /**
   * Re-derive against a freshly read manifest.
   *
   * Applied on the first read and on **every** later one, which is what makes
   * the screen revocation-aware without polling: when a Side or Area is retired
   * between reads, server truth wins at the next authoritative read and the
   * stale selection is replaced rather than kept.
   */
  | { readonly type: 'reconcile'; readonly placement: PublicProductPlacementResponse }
  | {
      readonly type: 'select-side';
      readonly placement: PublicProductPlacementResponse;
      readonly sideId: string;
    }
  | {
      readonly type: 'select-area';
      readonly placement: PublicProductPlacementResponse;
      readonly areaId: string;
    }
  | { readonly type: 'select-template'; readonly templateSlug: string }
  | { readonly type: 'clear-template' };

/** A complete, self-consistent selection for one Side of one manifest. */
function selectionForSide(
  placement: PublicProductPlacementResponse,
  sideId: string | null,
): StudioSelection {
  const side = findSide(placement, sideId) ?? initialSideOf(placement);
  const area = initialAreaOf(side);
  return {
    sideId: side?.id ?? null,
    areaId: area?.id ?? null,
    templateSlug: null,
  };
}

export function studioSelectionReducer(
  state: StudioSelection,
  action: StudioSelectionAction,
): StudioSelection {
  switch (action.type) {
    case 'reconcile': {
      const side = findSide(action.placement, state.sideId);
      if (side === undefined) return selectionForSide(action.placement, null);
      // The Side survived; the Area is then checked **within it**, so an Area
      // that was retired takes a new deterministic Area on the same Side rather
      // than moving the visitor to a different Side.
      const area = findArea(side, state.areaId);
      if (area !== undefined) return state;
      return { ...selectionForSide(action.placement, side.id) };
    }
    case 'select-side': {
      if (action.sideId === state.sideId) return state;
      if (findSide(action.placement, action.sideId) === undefined) return state;
      return selectionForSide(action.placement, action.sideId);
    }
    case 'select-area': {
      if (action.areaId === state.areaId) return state;
      const side = findSide(action.placement, state.sideId);
      // An Area is only selectable inside the currently selected Side. A cross-
      // Side id is not "rejected" so much as unrepresentable: it never resolves.
      if (findArea(side, action.areaId) === undefined) return state;
      return { sideId: state.sideId, areaId: action.areaId, templateSlug: null };
    }
    case 'select-template':
      if (action.templateSlug === state.templateSlug) return state;
      return { ...state, templateSlug: action.templateSlug };
    case 'clear-template':
      if (state.templateSlug === null) return state;
      return { ...state, templateSlug: null };
  }
}
