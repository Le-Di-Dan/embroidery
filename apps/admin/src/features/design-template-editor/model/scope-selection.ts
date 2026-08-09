/**
 * The Product → Side → Area selection, as a pure model (`APP3-A03-C1`).
 *
 * A reducer rather than three `useState`s, because the interesting behaviour is
 * what a change **invalidates**. Choosing a different Product makes the current
 * Side meaningless and the current Area doubly so; choosing a different Side
 * makes the Area meaningless. Left to three independent setters, that clearing
 * is a rule every call site has to remember, and the failure mode is a request
 * carrying a Side from one Product and an Area from another — precisely the
 * partial-scope state `IMP-D042` PO-06 calls *wrong* rather than incomplete.
 *
 * Here the clearing is structural: the transition function cannot produce a
 * selection whose parts disagree.
 *
 * Nothing in this file decides whether a triple is *valid*. Ownership and
 * retirement are facts about the Product's placement, so they are read from it
 * (below) rather than remembered; the server re-proves both anyway, and a client
 * that believed its own copy would be the one that drifts.
 */
import type {
  AdminPlacementAreaResponse,
  AdminPlacementSideResponse,
  AdminProductPlacementResponse,
} from '@embroidery/api-client';

export interface ScopeSelection {
  readonly productId: string | null;
  readonly productSideId: string | null;
  readonly embroideryAreaId: string | null;
}

export const EMPTY_SCOPE_SELECTION: ScopeSelection = {
  productId: null,
  productSideId: null,
  embroideryAreaId: null,
};

export type ScopeSelectionAction =
  | { readonly type: 'SELECT_PRODUCT'; readonly productId: string | null }
  | { readonly type: 'SELECT_SIDE'; readonly productSideId: string | null }
  | { readonly type: 'SELECT_AREA'; readonly embroideryAreaId: string | null }
  | { readonly type: 'RESET' };

export function scopeSelectionReducer(
  state: ScopeSelection,
  action: ScopeSelectionAction,
): ScopeSelection {
  switch (action.type) {
    case 'SELECT_PRODUCT':
      // The Side and Area belonged to the *previous* Product. Keeping either
      // would let a confirm submit a triple whose parts come from two Products.
      return { productId: action.productId, productSideId: null, embroideryAreaId: null };

    case 'SELECT_SIDE':
      return { ...state, productSideId: action.productSideId, embroideryAreaId: null };

    case 'SELECT_AREA':
      return { ...state, embroideryAreaId: action.embroideryAreaId };

    default:
      return EMPTY_SCOPE_SELECTION;
  }
}

/**
 * A row is offered only while it is live.
 *
 * `IMP-D041` retires without deleting so existing references survive; a retired
 * row is therefore a perfectly good *historical* placement and never a legal
 * **new** one. `APP3-B03B` refuses it server-side, so offering it would mean
 * showing a choice whose only outcome is a rejection.
 *
 * The generated type models `retiredAt` as a nullable object, so this checks for
 * "no value" rather than for a string.
 */
function isLive(row: { readonly retiredAt?: unknown }): boolean {
  return row.retiredAt === null || row.retiredAt === undefined;
}

/** The Sides a new scope may name, in the Product's own order. */
export function selectableSides(
  placement: AdminProductPlacementResponse | undefined,
): readonly AdminPlacementSideResponse[] {
  return (placement?.sides ?? []).filter(isLive);
}

/**
 * The Areas a new scope may name — **only** those hanging from the chosen Side.
 *
 * Read from that Side's own `areas` rather than from a flattened Product-wide
 * list, so an Area from a sibling Side is not merely filtered out but never
 * reachable. That is the same containment `APP3-B03`'s server-side authority
 * enforces, and the one a flat list would quietly lose.
 */
export function selectableAreas(
  placement: AdminProductPlacementResponse | undefined,
  productSideId: string | null,
): readonly AdminPlacementAreaResponse[] {
  if (productSideId === null) return [];
  const side = (placement?.sides ?? []).find((candidate) => candidate.id === productSideId);
  if (side === undefined || !isLive(side)) return [];
  return side.areas.filter(isLive);
}

/** The complete triple, or `null` — there is no partial scope to submit. */
export function completeSelection(selection: ScopeSelection): {
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
} | null {
  const { productId, productSideId, embroideryAreaId } = selection;
  if (productId === null || productSideId === null || embroideryAreaId === null) return null;
  return { productId, productSideId, embroideryAreaId };
}
