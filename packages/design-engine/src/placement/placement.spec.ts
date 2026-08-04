/**
 * Placement authority reconciliation and px↔mm conversion.
 *
 * Two cases carry the weight. **Retirement is not deletion**: a retired row is
 * refused for `NEW_EDITING` and accepted for `HISTORICAL_RENDER`, because
 * conflating them either breaks every design already approved on that placement
 * or lets a customer start a new one on a placement the store has withdrawn.
 *
 * And **inconsistent axes are reported, never averaged**: a Product Side whose
 * width and height imply different scales is broken authority, and splitting the
 * difference would make every downstream millimetre quietly wrong.
 */
import { areaAuthority, placement, sideAuthority } from '../testing/fixtures';
import type { DesignPlacementSnapshot } from '@embroidery/design-document';
import { validatePlacementSnapshot } from './authority';
import {
  UnitConversionError,
  mmToPx,
  pxToMm,
  sizeMmToPx,
  sizePxToMm,
  validateProductSideScaleConsistency,
} from './units';

const snapshot = (overrides: Record<string, unknown> = {}) =>
  placement(overrides) as unknown as DesignPlacementSnapshot;

const codes = (...args: Parameters<typeof validatePlacementSnapshot>) =>
  validatePlacementSnapshot(...args).findings.map((finding) => finding.code);

describe('placement snapshot reconciliation', () => {
  it('accepts a document that matches its authority exactly', () => {
    const result = validatePlacementSnapshot(snapshot(), sideAuthority(), areaAuthority());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('reports a Product Side id mismatch', () => {
    expect(
      codes(snapshot({ productSideId: 'side-back' }), sideAuthority(), areaAuthority()),
    ).toEqual(['PLACEMENT_SIDE_MISMATCH']);
  });

  it('reports an Embroidery Area id mismatch', () => {
    expect(
      codes(snapshot({ embroideryAreaId: 'area-sleeve' }), sideAuthority(), areaAuthority()),
    ).toEqual(['PLACEMENT_AREA_MISMATCH']);
  });

  it('reports an area that belongs to another side', () => {
    const area = areaAuthority({ productSideId: 'side-back' });
    expect(codes(snapshot(), sideAuthority(), area)).toEqual(['PLACEMENT_AREA_MISMATCH']);
  });

  it('reports each numeric mismatch independently', () => {
    for (const [field, value] of [
      ['canvasWidthPx', 999],
      ['canvasHeightPx', 999],
      ['physicalWidthMm', 199],
      ['physicalHeightMm', 199],
      ['pxPerMm', 4],
    ] as const) {
      expect(codes(snapshot({ [field]: value }), sideAuthority(), areaAuthority())).toEqual([
        'PLACEMENT_AUTHORITY_MISMATCH',
      ]);
    }
  });

  it('compares numbers on the quantized grid, not by tolerance', () => {
    // One quantized unit apart is a mismatch; below the grid it is not.
    expect(codes(snapshot({ pxPerMm: 5.0001 }), sideAuthority(), areaAuthority())).toEqual([
      'PLACEMENT_AUTHORITY_MISMATCH',
    ]);
    expect(codes(snapshot({ pxPerMm: 5.000_001 }), sideAuthority(), areaAuthority())).toEqual([]);
  });

  it('never substitutes an authority value into the document', () => {
    const document = snapshot({ pxPerMm: 4 });
    const before = { ...document };
    validatePlacementSnapshot(document, sideAuthority(), areaAuthority());
    expect(document).toEqual(before);
  });
});

describe('placement modes', () => {
  const retiredSide = sideAuthority({ retiredAt: '2026-01-01T00:00:00Z' });
  const retiredArea = areaAuthority({ retiredAt: '2026-01-01T00:00:00Z' });

  it('refuses a retired side or area for new editing', () => {
    expect(codes(snapshot(), retiredSide, areaAuthority(), 'NEW_EDITING')).toEqual([
      'PLACEMENT_RETIRED',
    ]);
    expect(codes(snapshot(), sideAuthority(), retiredArea, 'NEW_EDITING')).toEqual([
      'PLACEMENT_RETIRED',
    ]);
  });

  it('defaults to new editing when no mode is given', () => {
    expect(codes(snapshot(), retiredSide, areaAuthority())).toEqual(['PLACEMENT_RETIRED']);
  });

  it('accepts the same retired rows for historical rendering', () => {
    expect(codes(snapshot(), retiredSide, retiredArea, 'HISTORICAL_RENDER')).toEqual([]);
  });

  it('still checks geometry in historical mode', () => {
    // Retirement is forgiven; a wrong canvas size is not.
    expect(
      codes(snapshot({ canvasWidthPx: 999 }), retiredSide, retiredArea, 'HISTORICAL_RENDER'),
    ).toEqual(['PLACEMENT_AUTHORITY_MISMATCH']);
  });

  it('does not follow a replacement chain automatically', () => {
    // The engine validates the row it was handed. Nothing here reads
    // supersededById, so a historical document cannot be silently re-pointed.
    const result = validatePlacementSnapshot(
      snapshot(),
      retiredSide,
      retiredArea,
      'HISTORICAL_RENDER',
    );
    expect(JSON.stringify(result)).not.toContain('superseded');
  });
});

describe('px to mm conversion', () => {
  it('converts both ways using Product Side pxPerMm', () => {
    expect(pxToMm(100, 5)).toBe(20);
    expect(mmToPx(20, 5)).toBe(100);
    expect(sizePxToMm({ width: 100, height: 50 }, 5)).toEqual({ width: 20, height: 10 });
    expect(sizeMmToPx({ width: 20, height: 10 }, 5)).toEqual({ width: 100, height: 50 });
  });

  it('round-trips exactly for values the grid can hold', () => {
    for (const px of [0, 1, 37, 1234.5]) {
      expect(mmToPx(pxToMm(px, 5), 5)).toBe(px);
    }
  });

  it('is stable once quantized, rather than exact for every input', () => {
    // 1234.5678 px is 246.91356 mm, which the 1/10000 grid cannot hold, so the
    // first round trip lands on 1234.568. What must hold is that it stays
    // there: an autosave that re-converted an unchanged design would otherwise
    // drift a little further every save.
    const once = mmToPx(pxToMm(1234.5678, 5), 5);
    expect(once).toBe(1234.568);
    expect(mmToPx(pxToMm(once, 5), 5)).toBe(once);
  });

  it('allows a zero length', () => {
    expect(pxToMm(0, 5)).toBe(0);
    expect(mmToPx(0, 5)).toBe(0);
  });

  it('rejects a negative or non-finite length', () => {
    expect(() => pxToMm(-1, 5)).toThrow(UnitConversionError);
    expect(() => mmToPx(Number.NaN, 5)).toThrow(UnitConversionError);
  });

  it('rejects a non-positive or non-finite scale', () => {
    for (const scale of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pxToMm(10, scale)).toThrow(UnitConversionError);
    }
  });

  it('uses no DPI constant and no area-derived ratio', () => {
    // 96 DPI would make 96px one inch (25.4mm); the authority says 5 px/mm.
    expect(pxToMm(96, 5)).toBe(19.2);
    expect(pxToMm(96, 5)).not.toBe(25.4);
  });
});

describe('Product Side scale consistency', () => {
  it('accepts authority whose two axes agree', () => {
    expect(validateProductSideScaleConsistency(sideAuthority()).ok).toBe(true);
  });

  it('reports a width axis that implies a different scale', () => {
    const side = sideAuthority({ imageWidthPx: 1200 });
    const result = validateProductSideScaleConsistency(side);
    expect(result.findings.map((finding) => finding.code)).toEqual(['PX_PER_MM_MISMATCH']);
    expect(result.findings[0]?.path).toContain('width');
  });

  it('reports a height axis that implies a different scale', () => {
    const result = validateProductSideScaleConsistency(sideAuthority({ physicalHeightMm: 250 }));
    expect(result.findings[0]?.path).toContain('height');
  });

  it('reports both axes rather than averaging them', () => {
    const side = sideAuthority({ imageWidthPx: 1200, imageHeightPx: 800 });
    const result = validateProductSideScaleConsistency(side);
    expect(result.findings).toHaveLength(2);
    // The implied scales are 6 and 4; an average of 5 would have hidden both.
    expect(result.findings[0]?.meta?.implied).toBe(6);
    expect(result.findings[1]?.meta?.implied).toBe(4);
  });

  it('rejects a non-positive pxPerMm outright', () => {
    expect(validateProductSideScaleConsistency(sideAuthority({ pxPerMm: 0 })).ok).toBe(false);
  });
});
