/**
 * Side and Embroidery Area selection over the public placement manifest
 * (`APP3-S01`, IMP-D041).
 *
 * Pure functions over `publicProductPlacementGet`'s response. The manifest is
 * the **sole** Side/Area authority for the Studio: it already excludes retired
 * rows and reports `studioEligible`, so nothing here filters by activity or
 * decides eligibility for itself — inventing either would be inventing
 * placement.
 */
import type {
  PublicPlacementAreaResponse,
  PublicPlacementSideResponse,
  PublicProductPlacementResponse,
} from '@embroidery/api-client';

/** The exact compatibility context `APP3-B05` matches a Template against. */
export interface StudioPlacementTriple {
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

/** What the bootstrap needs to name a placement in a `APP3-B07` request body. */
export interface StudioPlacementCodes {
  readonly sideCode: string;
  readonly areaCode: string;
}

interface Ordered {
  readonly displayOrder: number;
  readonly code: string;
  readonly id: string;
}

/**
 * Canonical order: `displayOrder`, then `code`, then `id`.
 *
 * The same order the API documents for the manifest, applied again here rather
 * than trusted from the wire. Two rows may legitimately share a `displayOrder`,
 * so `code` and finally the immutable `id` break the tie — which is what makes
 * "the first row" mean the same row on every load instead of whatever the
 * transport happened to deliver first.
 */
function byCanonicalOrder(left: Ordered, right: Ordered): number {
  if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function orderedSides(
  placement: PublicProductPlacementResponse,
): readonly PublicPlacementSideResponse[] {
  return [...placement.sides].sort(byCanonicalOrder);
}

export function orderedAreas(
  side: PublicPlacementSideResponse,
): readonly PublicPlacementAreaResponse[] {
  return [...side.areas].sort(byCanonicalOrder);
}

export function findSide(
  placement: PublicProductPlacementResponse,
  sideId: string | null,
): PublicPlacementSideResponse | undefined {
  if (sideId === null) return undefined;
  return placement.sides.find((side) => side.id === sideId);
}

export function findArea(
  side: PublicPlacementSideResponse | undefined,
  areaId: string | null,
): PublicPlacementAreaResponse | undefined {
  if (side === undefined || areaId === null) return undefined;
  // Areas are looked up **within one Side**, never across the manifest, which
  // is what makes an Area from another Side unrepresentable rather than merely
  // unlikely.
  return side.areas.find((area) => area.id === areaId);
}

/**
 * The Side a fresh visit starts on: the first row in canonical order.
 *
 * IMP-D041 / `APP3-G01` PO-04 names the ordered active Side list as the
 * customer-facing authority and "the first active row by display order + stable
 * tie-breaker" as the initial choice. Nothing may narrow that list before the
 * first row is taken — not by Area count, not by background, Template count or
 * bootstrap readiness. `studioEligible` is a whole-Product fact, so a first Side
 * carrying no Area is a real state of a genuinely eligible Product, and skipping
 * past it would be the frontend rewriting PO-04 into "the first Studio-usable
 * Side wins". The screen shows that Side, says why it cannot be worked on, and
 * leaves the Side selector operable so the visitor moves themselves.
 */
export function initialSideOf(
  placement: PublicProductPlacementResponse,
): PublicPlacementSideResponse | undefined {
  return orderedSides(placement)[0];
}

/** The Area a Side starts on: the first in canonical order, within that Side. */
export function initialAreaOf(
  side: PublicPlacementSideResponse | undefined,
): PublicPlacementAreaResponse | undefined {
  if (side === undefined) return undefined;
  return orderedAreas(side)[0];
}

/**
 * The compatibility triple, or `undefined` when the placement is not fully
 * resolved. There is no partial triple: `APP3-B05` requires all three ids and
 * offers no Product-wide, Side-wide or wildcard match, so a request is either
 * completely addressed or not made.
 */
export function tripleOf(
  placement: PublicProductPlacementResponse,
  side: PublicPlacementSideResponse | undefined,
  area: PublicPlacementAreaResponse | undefined,
): StudioPlacementTriple | undefined {
  if (side === undefined || area === undefined) return undefined;
  return {
    productId: placement.productId,
    productSideId: side.id,
    embroideryAreaId: area.id,
  };
}

/**
 * The public codes `APP3-B07` names a placement by.
 *
 * Bootstrap addresses a placement by slug and codes while the Template list
 * addresses it by ids; both come from the same manifest rows, so the session is
 * opened on the placement the visitor actually chose.
 */
export function codesOf(
  side: PublicPlacementSideResponse | undefined,
  area: PublicPlacementAreaResponse | undefined,
): StudioPlacementCodes | undefined {
  if (side === undefined || area === undefined) return undefined;
  return { sideCode: side.code, areaCode: area.code };
}
