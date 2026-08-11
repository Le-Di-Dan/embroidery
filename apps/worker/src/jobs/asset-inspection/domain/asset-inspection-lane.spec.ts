import {
  CATALOG_INSPECTION_LANE,
  SESSION_INSPECTION_LANE,
  laneDerivativeKinds,
  resolveInspectionLane,
} from './asset-inspection-lane';
import { DERIVATIVE_KINDS } from './asset-processing-policy';

describe('resolveInspectionLane', () => {
  it('resolves the catalog lane from its exact pair', () => {
    expect(resolveInspectionLane('CATALOG_MEDIA', 'PRODUCTION_SENSITIVE')).toBe(
      CATALOG_INSPECTION_LANE,
    );
  });

  it('resolves the session lane from its exact pair', () => {
    expect(resolveInspectionLane('CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE')).toBe(
      SESSION_INSPECTION_LANE,
    );
  });

  // The pair, never the kind alone. Each of these is a real combination the
  // schema permits and no delivered checkpoint writes.
  it.each([
    ['CUSTOMER_UPLOAD', 'PRODUCTION_SENSITIVE'],
    ['CUSTOMER_UPLOAD', 'PUBLIC'],
    ['CATALOG_MEDIA', 'PUBLIC'],
    ['CATALOG_MEDIA', 'CUSTOMER_PRIVATE'],
    ['TEMPLATE_SOURCE', 'PRODUCTION_SENSITIVE'],
    ['PRODUCTION_FILE', 'PRODUCTION_SENSITIVE'],
    ['GALLERY_MEDIA', 'PUBLIC'],
  ])('refuses %s / %s', (kind, classification) => {
    expect(resolveInspectionLane(kind, classification)).toBeUndefined();
  });
});

describe('lane outputs', () => {
  it('keeps the catalog lane on both accepted derivative policies, in order', () => {
    expect(laneDerivativeKinds(CATALOG_INSPECTION_LANE)).toEqual([...DERIVATIVE_KINDS]);
  });

  /*
   * The load-bearing asymmetry. A `THUMBNAIL` or `CATALOG_PREVIEW` of a private
   * customer upload would be catalogue media derived from something that is not
   * catalogue media, and nothing would ever serve it — `APP3-B06C` delivers
   * `NORMALIZED` only. `NORMALIZED` itself is `APP3-W01A`'s output, produced
   * from the `asset.normalization.requested` event `APP3-B06B` already emits, so
   * writing one here would be a second producer of one derivative kind.
   */
  it('gives the session lane no derivative of its own', () => {
    expect(SESSION_INSPECTION_LANE.derivatives).toEqual([]);
    expect(laneDerivativeKinds(SESSION_INSPECTION_LANE)).toEqual([]);
  });

  it('never lets the session lane claim an editor-safe or catalogue kind', () => {
    for (const kind of laneDerivativeKinds(SESSION_INSPECTION_LANE)) {
      expect(['NORMALIZED', 'THUMBNAIL', 'CATALOG_PREVIEW']).not.toContain(kind);
    }
    expect(laneDerivativeKinds(SESSION_INSPECTION_LANE)).toHaveLength(0);
  });
});
