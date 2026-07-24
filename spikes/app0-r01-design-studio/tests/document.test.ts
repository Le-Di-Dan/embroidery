import {
  DocumentValidationError,
  isSemanticallyEqual,
  parseDocument,
} from '../src/document/validate';
import {
  SCENE_ELEMENT_COUNTS,
  commonScene,
  crossEngineSubset,
  performanceScene,
} from '../src/document/scene';
import { documentPxToMm, fitsInArea, mmToDocumentPx } from '../src/document/units';
import { createWatermarkPolicy, watermarkTiles } from '../src/harness/watermark';

describe('document validation', () => {
  it('accepts the common scene', () => {
    expect(parseDocument(JSON.parse(JSON.stringify(commonScene())))).toBeDefined();
  });

  it('fails loudly on an unknown schema version instead of guessing', () => {
    expect(() => parseDocument({ ...commonScene(), schemaVersion: 99 })).toThrow(
      DocumentValidationError,
    );
  });

  it.each(['viewport', 'selected', 'watermark', 'objectURL', 'canvas'])(
    'rejects the transient key %s anywhere in the payload',
    (key) => {
      const payload = JSON.parse(JSON.stringify(commonScene())) as Record<string, unknown>;
      payload[key] = { anything: true };
      expect(() => parseDocument(payload)).toThrow(DocumentValidationError);
    },
  );

  it('rejects engine or DOM objects', () => {
    const payload = { ...commonScene(), productSide: new Map() };
    expect(() => parseDocument(payload)).toThrow(DocumentValidationError);
  });

  it('rejects duplicate element ids', () => {
    const scene = commonScene();
    const first = scene.elements[0];
    expect(first).toBeDefined();
    expect(() => parseDocument({ ...scene, elements: [...scene.elements, first] })).toThrow(
      DocumentValidationError,
    );
  });

  it('treats key order as insignificant but array order as significant', () => {
    const scene = commonScene();
    const reordered = {
      productSide: scene.productSide,
      schemaVersion: scene.schemaVersion,
      documentId: scene.documentId,
      elements: scene.elements,
    };
    expect(isSemanticallyEqual(scene, reordered)).toBe(true);
    expect(isSemanticallyEqual(scene, { ...scene, elements: [...scene.elements].reverse() })).toBe(
      false,
    );
  });
});

describe('scene fixtures', () => {
  it.each(['S', 'M', 'L'] as const)('builds %s with the frozen element count', (size) => {
    // +1 for the group element that carries the grouped children.
    expect(performanceScene(size).elements).toHaveLength(SCENE_ELEMENT_COUNTS[size] + 1);
  });

  it('is deterministic across calls', () => {
    expect(JSON.stringify(performanceScene('M'))).toBe(JSON.stringify(performanceScene('M')));
  });

  it('never contains a watermark', () => {
    expect(JSON.stringify(commonScene())).not.toContain('watermark');
  });

  it('exposes a cross-engine subset without groups or curved text', () => {
    const subset = crossEngineSubset();
    expect(subset.elements.some((element) => element.type === 'group')).toBe(false);
    expect(subset.elements.some((element) => element.id === 'el-text-curved')).toBe(false);
  });
});

describe('product units', () => {
  const area = commonScene().productSide.area;

  it('round-trips document pixels and millimetres', () => {
    expect(documentPxToMm(area, mmToDocumentPx(area, 50))).toBeCloseTo(50, 6);
  });

  it('reports overflow in millimetres when a design leaves the area', () => {
    const fit = fitsInArea(area, { xPx: area.xPx - 20, yPx: area.yPx, widthPx: 10, heightPx: 10 });
    expect(fit.withinArea).toBe(false);
    expect(fit.overflowMm).toBeCloseTo(10, 6);
  });
});

describe('watermark policy', () => {
  it('refuses a marker that looks like raw PII', () => {
    expect(() => createWatermarkPolicy('customer@example.com')).toThrow();
    expect(() => createWatermarkPolicy('84901234567')).toThrow();
  });

  it('tiles the whole preview with overscan so rotation still covers it', () => {
    const policy = createWatermarkPolicy('S-abc123');
    const tiles = watermarkTiles(policy, 900, 900);
    expect(tiles.length).toBeGreaterThan(20);
    expect(tiles.some((tile) => tile.xPx < 0 && tile.yPx < 0)).toBe(true);
  });
});
