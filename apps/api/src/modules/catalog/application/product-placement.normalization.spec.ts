/**
 * Which placement edits schedule normalization, and which must not
 * (`APP3-B01N`; IMP-D046 PO-04).
 *
 * The interesting half is the silence. Scheduling work that is not needed is
 * cheap to notice — a derivative appears — but *failing* to schedule, or
 * scheduling on a rename, is invisible until a Studio background is missing or a
 * queue is full of no-ops. So every no-append rule gets its own case.
 */
import type { ProductSideId } from '../domain/repositories/placement-hierarchy.port';
import type { UpdateSideFields } from '../domain/repositories/product-placement.repository';
import type { SidePlan } from './product-placement.plan';
import { planSideNormalizationRequests } from './product-placement.normalization';

const SIDE_A = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6001' as ProductSideId;
const SIDE_B = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6002' as ProductSideId;
const ASSET_A = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f7001';
const ASSET_B = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f7002';

const created = (id: ProductSideId, backgroundAssetId: string) =>
  ({
    id,
    productId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f0001',
    code: 'front',
    name: 'Front',
    displayOrder: 1,
    backgroundAssetId,
    imageWidthPx: 500,
    imageHeightPx: 250,
    physicalWidthMm: '100',
    physicalHeightMm: '50',
    pxPerMm: '5',
  }) as unknown as SidePlan['created'][number];

const plan = (parts: {
  readonly created?: SidePlan['created'];
  readonly updated?: readonly { readonly id: ProductSideId; readonly fields: UpdateSideFields }[];
  readonly retired?: SidePlan['retired'];
}): SidePlan => ({
  created: parts.created ?? [],
  updated: parts.updated ?? [],
  retired: parts.retired ?? [],
});

describe('planSideNormalizationRequests', () => {
  it('schedules a new side against its background', () => {
    expect(planSideNormalizationRequests(plan({ created: [created(SIDE_A, ASSET_A)] }))).toEqual([
      { productSideId: SIDE_A, assetId: ASSET_A },
    ]);
  });

  it('schedules the new Asset when a side is repointed', () => {
    const requests = planSideNormalizationRequests(
      plan({ updated: [{ id: SIDE_A, fields: { backgroundAssetId: ASSET_B } }] }),
    );
    expect(requests).toEqual([{ productSideId: SIDE_A, assetId: ASSET_B }]);
  });

  it('schedules nothing when the background survives the save', () => {
    // The plan omits `backgroundAssetId` when the requested Asset is the stored
    // one, so re-sending an unchanged placement is silent.
    expect(planSideNormalizationRequests(plan({ updated: [{ id: SIDE_A, fields: {} }] }))).toEqual(
      [],
    );
  });

  it('schedules nothing for a display-only change', () => {
    const requests = planSideNormalizationRequests(
      plan({ updated: [{ id: SIDE_A, fields: { name: 'Mặt trước', displayOrder: 2 } }] }),
    );
    expect(requests).toEqual([]);
  });

  it('schedules nothing for a geometry-only change', () => {
    const requests = planSideNormalizationRequests(
      plan({ updated: [{ id: SIDE_A, fields: { pxPerMm: '6', physicalWidthMm: '83.33' } }] }),
    );
    expect(requests).toEqual([]);
  });

  it('schedules nothing for an Area-only change', () => {
    // Areas never appear in the side plan, so an Area edit reaches this function
    // as an empty side plan.
    expect(planSideNormalizationRequests(plan({}))).toEqual([]);
  });

  it('schedules nothing for a retirement', () => {
    const requests = planSideNormalizationRequests(plan({ retired: [{ id: SIDE_A }] }));
    expect(requests).toEqual([]);
  });

  it('schedules only the replacement when a side is superseded', () => {
    const requests = planSideNormalizationRequests(
      plan({
        created: [created(SIDE_B, ASSET_B)],
        retired: [{ id: SIDE_A, supersededById: SIDE_B }],
      }),
    );
    expect(requests).toEqual([{ productSideId: SIDE_B, assetId: ASSET_B }]);
  });

  it('never names the Asset a side moved away from', () => {
    const requests = planSideNormalizationRequests(
      plan({ updated: [{ id: SIDE_A, fields: { backgroundAssetId: ASSET_B } }] }),
    );
    expect(requests.some((request) => request.assetId === ASSET_A)).toBe(false);
  });

  it('produces one deterministic intent per changed side, created first', () => {
    const requests = planSideNormalizationRequests(
      plan({
        created: [created(SIDE_B, ASSET_B)],
        updated: [{ id: SIDE_A, fields: { backgroundAssetId: ASSET_A } }],
      }),
    );
    expect(requests).toEqual([
      { productSideId: SIDE_B, assetId: ASSET_B },
      { productSideId: SIDE_A, assetId: ASSET_A },
    ]);
  });

  it('schedules twice when two sides share one Asset', () => {
    // Two associations, two events. The consumer converges them onto one
    // derivative; the producer does not get to decide that for it.
    const requests = planSideNormalizationRequests(
      plan({ created: [created(SIDE_A, ASSET_A), created(SIDE_B, ASSET_A)] }),
    );
    expect(requests).toEqual([
      { productSideId: SIDE_A, assetId: ASSET_A },
      { productSideId: SIDE_B, assetId: ASSET_A },
    ]);
  });

  it('does not mutate the plan it was given', () => {
    const input = plan({
      created: [created(SIDE_A, ASSET_A)],
      updated: [{ id: SIDE_B, fields: { backgroundAssetId: ASSET_B } }],
    });
    const snapshot = JSON.stringify(input);
    planSideNormalizationRequests(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
