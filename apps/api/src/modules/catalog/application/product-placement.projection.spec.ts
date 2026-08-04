/**
 * The two placement projections (`APP3-B01`; IMP-D041 PO-02, PO-06).
 *
 * The public suite is the security one. It asserts **absences** — no background
 * asset id, no retirement, no storage fact — and an absence has no runtime
 * signal, so nothing else would catch a field added to the shared geometry base
 * class and inherited into the manifest by accident.
 *
 * The `studioEligible` cases carry the rest of the weight. Spread across two
 * sides — areas on one, a usable background on the other — nothing can actually
 * be designed, and reporting `true` would drop the customer into an editor with
 * no canvas.
 */
import type {
  PlacementAreaRow,
  PlacementSideRow,
  PlacementSnapshot,
  PublicPlacement,
  PublicPlacementSideRow,
} from '../domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../domain/repositories/placement-hierarchy.port';
import { toAdminPlacementView, toPublicPlacementView } from './product-placement.projection';

const PRODUCT = 'product-1' as ProductId;
const SIDE = 'side-1' as ProductSideId;

const side = (overrides: Partial<PlacementSideRow> = {}): PlacementSideRow => ({
  id: SIDE,
  productId: PRODUCT,
  code: 'front',
  name: 'Mặt trước',
  displayOrder: 0,
  backgroundAssetId: 'asset-secret-1',
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  physicalWidthMm: '200.00',
  physicalHeightMm: '200.00',
  pxPerMm: '5.0',
  retiredAt: undefined,
  supersededById: undefined,
  ...overrides,
});

const area = (overrides: Partial<PlacementAreaRow> = {}): PlacementAreaRow => ({
  id: 'area-1' as EmbroideryAreaId,
  productSideId: SIDE,
  code: 'chest',
  name: 'Ngực',
  displayOrder: 0,
  boundXPx: '100',
  boundYPx: '100',
  boundWidthPx: '400',
  boundHeightPx: '300',
  maxWidthMm: undefined,
  maxHeightMm: undefined,
  retiredAt: undefined,
  supersededById: undefined,
  ...overrides,
});

const publicSide = (overrides: Partial<PublicPlacementSideRow> = {}): PublicPlacementSideRow => ({
  id: SIDE,
  code: 'front',
  name: 'Mặt trước',
  displayOrder: 0,
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  physicalWidthMm: '200.00',
  physicalHeightMm: '200.00',
  pxPerMm: '5.0',
  hasEligibleBackground: true,
  ...overrides,
});

const snapshot = (
  sides: readonly PlacementSideRow[],
  areas: readonly PlacementAreaRow[],
): PlacementSnapshot => ({
  product: {
    id: PRODUCT,
    slug: 'ao-thun',
    status: 'DRAFT',
    updatedAt: new Date('2026-08-04T10:00:00Z'),
  },
  sides,
  areas,
});

const manifest = (
  sides: readonly PublicPlacementSideRow[],
  areas: readonly PlacementAreaRow[],
): PublicPlacement => ({ productId: PRODUCT, slug: 'ao-thun', sides, areas });

describe('the Admin authoring view', () => {
  it('carries the background association and the retirement state', () => {
    const view = toAdminPlacementView(
      snapshot([side({ retiredAt: new Date('2026-01-01T00:00:00Z') })], []),
    );
    expect(view.sides[0]?.backgroundAssetId).toBe('asset-secret-1');
    expect(view.sides[0]?.retiredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(view.sides[0]?.supersededById).toBeNull();
  });

  it('exposes the concurrency token a replace must echo back', () => {
    expect(toAdminPlacementView(snapshot([], [])).updatedAt).toBe('2026-08-04T10:00:00.000Z');
  });

  it('converts stored numerics to numbers exactly once', () => {
    const view = toAdminPlacementView(snapshot([side()], [area()]));
    expect(view.sides[0]?.pxPerMm).toBe(5);
    expect(view.sides[0]?.physicalWidthMm).toBe(200);
    expect(view.sides[0]?.areas[0]?.boundWidthPx).toBe(400);
    expect(view.sides[0]?.areas[0]?.maxWidthMm).toBeNull();
  });

  it('nests each area under the side it belongs to', () => {
    const other = side({ id: 'side-2' as ProductSideId, code: 'back' });
    const view = toAdminPlacementView(
      snapshot(
        [side(), other],
        [area(), area({ id: 'area-2' as EmbroideryAreaId, productSideId: other.id })],
      ),
    );
    expect(view.sides[0]?.areas.map((a) => a.id)).toEqual(['area-1']);
    expect(view.sides[1]?.areas.map((a) => a.id)).toEqual(['area-2']);
  });
});

describe('the public manifest', () => {
  it('carries no private or mutation field anywhere', () => {
    const view = toPublicPlacementView(manifest([publicSide()], [area()]));
    const serialized = JSON.stringify(view);
    for (const forbidden of [
      'backgroundAssetId',
      'asset-secret-1',
      'retiredAt',
      'supersededById',
      'storageKey',
      'checksum',
      'derivative',
      'inspection',
      'http',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('addresses the background by reference components, never a URL', () => {
    const view = toPublicPlacementView(manifest([publicSide()], []));
    // `APP3-B02` owns the delivery route and has not been built; composing an
    // address here would publish one that does not resolve.
    expect(view.sides[0]?.background).toEqual({ productSlug: 'ao-thun', sideCode: 'front' });
    expect(JSON.stringify(view)).not.toContain('/api/');
  });

  it('is Studio-eligible only when one side has both an area and a background', () => {
    expect(toPublicPlacementView(manifest([publicSide()], [area()])).studioEligible).toBe(true);
  });

  it('is not eligible when the only side has no area', () => {
    expect(toPublicPlacementView(manifest([publicSide()], [])).studioEligible).toBe(false);
  });

  it('is not eligible when the background is unprocessed', () => {
    const view = toPublicPlacementView(
      manifest([publicSide({ hasEligibleBackground: false })], [area()]),
    );
    expect(view.studioEligible).toBe(false);
    // The side is still described: the geometry is real even though the Studio
    // cannot open on it, and inventing an absence would be a second lie.
    expect(view.sides).toHaveLength(1);
  });

  it('is not eligible when the area and the usable background are on different sides', () => {
    const withArea = publicSide({ hasEligibleBackground: false });
    const withBackground = publicSide({ id: 'side-2' as ProductSideId, code: 'back' });
    expect(
      toPublicPlacementView(manifest([withArea, withBackground], [area()])).studioEligible,
    ).toBe(false);
  });

  it('reports an empty placement rather than an error', () => {
    // Publication never required placement (PO-06): the Product is still public.
    const view = toPublicPlacementView(manifest([], []));
    expect(view.sides).toEqual([]);
    expect(view.studioEligible).toBe(false);
  });

  it('preserves the repository ordering rather than re-sorting', () => {
    const first = publicSide({ code: 'back', displayOrder: 0 });
    const second = publicSide({ id: 'side-2' as ProductSideId, code: 'front', displayOrder: 1 });
    const view = toPublicPlacementView(manifest([first, second], []));
    expect(view.sides.map((s) => s.code)).toEqual(['back', 'front']);
  });
});
