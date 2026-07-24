import { ENGINES, expect, openBench, test, writeRaw } from './support/bench-test';
import type { SceneSize } from '../src/document/scene';

const SIZES: readonly SceneSize[] = ['S', 'M', 'L'];
const GESTURES = ['drag', 'resize', 'rotate', 'zoom', 'pan'] as const;
const LOAD_SAMPLES = 7;
const WARMUP_SAMPLES = 2;
const GESTURE_FRAMES = 60;

/** Same scenes, same sample counts, same driver for every candidate. */
for (const engine of ENGINES) {
  test.describe(`performance — ${engine}`, () => {
    test(`${engine} S/M/L performance`, async ({ page }, testInfo) => {
      await openBench(page, engine);

      const scenes: Record<string, unknown> = {};
      for (const size of SIZES) {
        await page.evaluate(
          async ([id, sceneSize]) => {
            await window.__spike?.mount(id, sceneSize);
          },
          [engine, size] as const,
        );
        // Warm up before measuring so JIT and first-paint costs are excluded.
        await page.evaluate(async (samples) => {
          await window.__spike?.measureLoad('M', samples);
        }, WARMUP_SAMPLES);

        const load = await page.evaluate(
          async ([sceneSize, samples]) =>
            window.__spike?.measureLoad(sceneSize as 'S', samples as number),
          [size, LOAD_SAMPLES] as const,
        );
        const selection = await page.evaluate(() => window.__spike?.measureSelection(10));
        const undoRedo = await page.evaluate(() => window.__spike?.measureUndoRedo(5));
        const nodes = await page.evaluate(() => window.__spike?.nodeCounts());

        const gestures: Record<string, unknown> = {};
        for (const gesture of GESTURES) {
          gestures[gesture] = await page.evaluate(
            async ([kind, frames]) =>
              window.__spike?.measureGesture(kind as 'drag', frames as number),
            [gesture, GESTURE_FRAMES] as const,
          );
        }

        scenes[size] = { load, selection, undoRedo, nodes, gestures };
      }

      // Attribution: same M scene, negligible watermark tile count. Separates
      // "the engine is slow" from "the repeated watermark is expensive on this
      // engine's rendering model".
      await page.evaluate(async (id) => {
        await window.__spike?.mount(id, 'M', { sparseWatermark: true });
      }, engine);
      const sparseWatermarkDrag = await page.evaluate(
        (frames) => window.__spike?.measureGesture('drag', frames),
        GESTURE_FRAMES,
      );

      const canonical = await page.evaluate(() => ({
        M: window.__spike?.measureCanonical('M', 30),
        L: window.__spike?.measureCanonical('L', 30),
      }));
      const leak = await page.evaluate(() => window.__spike?.leakProbe(20));

      writeRaw(`performance.${engine}.${testInfo.project.name}`, {
        engine,
        project: testInfo.project.name,
        scenes,
        sparseWatermarkDragM: sparseWatermarkDrag,
        canonical,
        leak,
      });

      expect(leak?.domNodesAfter, 'container is empty after teardown').toBe(0);
    });
  });
}
