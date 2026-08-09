/**
 * Resolving a Template's scope against the Product's authoritative placement.
 *
 * The Template carries three **ids** and nothing else. Names, canvas size,
 * physical size and `pxPerMm` all live on the Product Side, so they are looked
 * up here rather than guessed — and looked up **by id**, never by name, code or
 * position. A Side matched by name would silently follow a rename; a Side
 * matched by index would follow a reorder.
 *
 * Resolution fails closed. If either id no longer names a row the screen reports
 * that it cannot resolve the context, and never falls back to "the first Side"
 * or "the only Area" — a fallback would author a document against geometry the
 * Template does not point at, and nothing on screen would say so.
 *
 * A retired Side or Area still resolves. Retirement withdraws a row from *new*
 * selection; a Template already scoped to one is not thereby unscoped, and
 * hiding it would leave an existing draft with no context at all.
 */
import type {
  AdminDesignTemplateScopeResponse,
  AdminPlacementAreaResponse,
  AdminPlacementSideResponse,
  AdminProductPlacementResponse,
} from '@embroidery/api-client';

export interface ResolvedTemplateScope {
  readonly productId: string;
  readonly side: AdminPlacementSideResponse;
  readonly area: AdminPlacementAreaResponse;
}

export type ScopeResolution =
  /** The scope names rows that exist on the Product right now. */
  | { readonly kind: 'resolved'; readonly scope: ResolvedTemplateScope }
  /** The scope names a Side or Area the Product no longer has. */
  | { readonly kind: 'unresolved' };

export function resolveTemplateScope(
  scope: AdminDesignTemplateScopeResponse,
  placement: AdminProductPlacementResponse,
): ScopeResolution {
  const side = placement.sides.find((candidate) => candidate.id === scope.productSideId);
  if (side === undefined) return { kind: 'unresolved' };

  const area = side.areas.find((candidate) => candidate.id === scope.embroideryAreaId);
  if (area === undefined) return { kind: 'unresolved' };

  return { kind: 'resolved', scope: { productId: scope.productId, side, area } };
}
