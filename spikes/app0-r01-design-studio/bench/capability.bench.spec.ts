import { ENGINES, expect, openBench, test, writeRaw } from './support/bench-test';

/**
 * Capability, watermark and serialization gates. Every candidate is driven
 * through the identical adapter API, so a "yes" here means the same thing for
 * all of them.
 */
for (const engine of ENGINES) {
  test.describe(`capability — ${engine}`, () => {
    test(`${engine} passes the capability, watermark and serialization gates`, async ({
      page,
    }, testInfo) => {
      await openBench(page, engine);
      await page.evaluate(async (id) => {
        await window.__spike?.mount(id, 'S');
      }, engine);

      const capabilities = await page.evaluate(() => window.__spike?.capabilities());
      const watermark = await page.evaluate(() => window.__spike?.watermark());
      const serialization = await page.evaluate(() => window.__spike?.measureSerialization(20));
      const pointer = await page.evaluate(() => window.__spike?.pointerState());

      writeRaw(`capability.${engine}.${testInfo.project.name}`, {
        engine,
        project: testInfo.project.name,
        capabilities,
        watermark,
        serialization,
        svgScriptExecuted: pointer?.svgScriptExecuted ?? false,
      });

      // Hard gates.
      expect(capabilities?.multiSelect, 'multi-select').toBe(true);
      expect(capabilities?.zOrder, 'z-order').toBe(true);
      expect(capabilities?.groupUngroup, 'group/ungroup').toBe(true);
      expect(capabilities?.lockHide, 'lock/hide').toBe(true);
      expect(capabilities?.rasterTransform, 'raster transform').toBe(true);
      expect(capabilities?.svgLoaded, 'svg element loaded').toBe(true);
      expect(capabilities?.undoRedo, 'domain undo/redo').toBe(true);
      expect(capabilities?.viewportIndependentOfDocument, 'viewport is transient').toBe(true);
      expect(capabilities?.outOfAreaWarning, 'out-of-area warning').toBe(true);

      expect(watermark?.selectAllExcludesWatermark, 'select-all excludes watermark').toBe(true);
      expect(watermark?.deleteAllKeepsWatermark, 'delete-all keeps watermark').toBe(true);
      expect(watermark?.serializationExcludesWatermark, 'watermark is not serialized').toBe(true);
      expect(watermark?.reloadRecreatesWatermark, 'reload recreates watermark').toBe(true);
      expect(watermark?.topmostAfterZoomPan, 'watermark topmost after zoom/pan').toBe(true);
      expect(watermark?.markerHasNoPii, 'watermark marker carries no raw PII').toBe(true);

      expect(serialization?.stableAcrossReload, 'stable canonical hash across reload').toBe(true);
      expect(serialization?.semanticRoundTrip, 'semantic round trip').toBe(true);
      expect(serialization?.stableAfterTransform, 'stable hash after transforms').toBe(true);
      expect(serialization?.rejectsTransientFields, 'rejects transient fields').toBe(true);
      expect(serialization?.rejectsUnknownVersion, 'rejects unknown schema version').toBe(true);

      expect(pointer?.svgScriptExecuted, 'no SVG script executed').toBe(false);
    });
  });
}
