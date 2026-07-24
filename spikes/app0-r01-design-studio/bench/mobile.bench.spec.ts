import { ENGINES, expect, openBench, test, writeRaw } from './support/bench-test';
import type { BrowserContext } from '@playwright/test';

/**
 * Real touch behaviour. Chromium gets genuine trusted multi-touch through CDP
 * (`Input.dispatchTouchEvent`); WebKit has no such control channel in
 * Playwright, so it is limited to single-finger touch and that limitation is
 * recorded rather than papered over. Neither is a real iOS/Android device.
 */
interface TouchPoint {
  x: number;
  y: number;
}

type TouchSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>;

/**
 * One CDP session for the whole test: the protocol tracks touch state per
 * session, so opening a session per event makes every move look like a stray
 * touch without a preceding TouchStart.
 */
async function dispatchTouch(
  session: TouchSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  points: TouchPoint[],
): Promise<void> {
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((touch) => ({ x: touch.x, y: touch.y })),
  });
}

for (const engine of ENGINES) {
  test.describe(`mobile — ${engine}`, () => {
    test.skip(({ isMobile }) => isMobile !== true, 'mobile projects only');

    test(`${engine} core touch tasks`, async ({ page, browserName }, testInfo) => {
      await openBench(page, engine);
      await page.evaluate(async (id) => {
        await window.__spike?.mount(id, 'S');
      }, engine);

      const stage = page.getByTestId('spike-stage');
      const box = await stage.boundingBox();
      expect(box).not.toBeNull();
      const origin = box ?? { x: 0, y: 0, width: 0, height: 0 };
      const cdpAvailable = browserName === 'chromium';
      const point = { x: origin.x + 320, y: origin.y + 300 };
      const result: Record<string, unknown> = {
        engine,
        project: testInfo.project.name,
        cdpAvailable,
      };

      // 1. Tap to select — supported on every touch-capable engine.
      await page.touchscreen.tap(point.x, point.y);
      const afterTap = await page.evaluate(() => window.__spike?.pointerState());
      result.tapLogged = afterTap?.log.some((entry) => entry.kind === 'tap') ?? false;
      result.touchActionNone = afterTap?.touchActionNone ?? false;
      result.handleCount = afterTap?.handleCount ?? 0;
      result.minHandleSizePx = afterTap?.minHandleSizePx ?? 0;
      result.targetMinPx = afterTap?.targetMinPx ?? 0;

      const before = await page.evaluate(() => window.__spike?.pointerState().selection[0] ?? null);
      const beforeBox = await page.evaluate(
        (id) => (id === null ? null : (window.__spike?.elementBox(id) ?? null)),
        before,
      );
      result.tapSelectedId = before;
      // Drag from exactly the point the tap already proved to be a hit. The
      // document box is NOT usable as a grip point for every engine: Fabric
      // draws an imported SVG group with its own layout origin, so the document
      // box centre can fall outside what Fabric hit-tests. That divergence is a
      // finding in its own right, recorded in the report.
      const grip = point;

      const session = cdpAvailable ? await page.context().newCDPSession(page) : null;
      if (session !== null) {
        // 2. One-finger drag.
        await dispatchTouch(session, 'touchStart', [grip]);
        for (let step = 1; step <= 8; step += 1) {
          await dispatchTouch(session, 'touchMove', [
            { x: grip.x + step * 4, y: grip.y + step * 2 },
          ]);
        }
        await dispatchTouch(session, 'touchEnd', []);
        const afterBox = await page.evaluate(
          (id) => (id === null ? null : window.__spike?.elementBox(id)),
          before,
        );
        result.dragMovedPx =
          beforeBox == null || afterBox == null ? 0 : Math.round(afterBox.xPx - beforeBox.xPx);

        const afterDrag = await page.evaluate(() => window.__spike?.pointerState());
        result.stateAfterDrag = {
          mode: afterDrag?.mode,
          selection: afterDrag?.selection,
          handleCount: afterDrag?.handleCount,
          activePointers: afterDrag?.activePointers,
        };

        // 3. Touch resize and rotate through the DOM handles.
        for (const handle of ['resize', 'rotate'] as const) {
          const locator = page.locator(`[data-handle="${handle}"]`);
          const handleBox =
            (await locator.count()) > 0 ? await locator.first().boundingBox() : null;
          if (handleBox !== null) {
            const centre = {
              x: handleBox.x + handleBox.width / 2,
              y: handleBox.y + handleBox.height / 2,
            };
            await dispatchTouch(session, 'touchStart', [centre]);
            await dispatchTouch(session, 'touchMove', [{ x: centre.x + 24, y: centre.y + 12 }]);
            await dispatchTouch(session, 'touchEnd', []);
          }
          const state = await page.evaluate(() => window.__spike?.pointerState());
          result[`${handle}Logged`] =
            state?.log.some((entry) => entry.kind === `${handle}-start`) ?? false;
        }

        // 4. Pinch zoom.
        await dispatchTouch(session, 'touchStart', [
          { x: grip.x - 40, y: grip.y },
          { x: grip.x + 40, y: grip.y },
        ]);
        await dispatchTouch(session, 'touchMove', [
          { x: grip.x - 120, y: grip.y },
          { x: grip.x + 120, y: grip.y },
        ]);
        await dispatchTouch(session, 'touchEnd', []);
        const afterPinch = await page.evaluate(() => window.__spike?.pointerState());
        result.zoomAfterPinch = afterPinch?.zoom ?? 1;

        // 5. Two-finger pan (fingers move together, distance unchanged).
        const beforePan = afterPinch?.panXPx ?? 0;
        await dispatchTouch(session, 'touchStart', [
          { x: grip.x - 40, y: grip.y },
          { x: grip.x + 40, y: grip.y },
        ]);
        await dispatchTouch(session, 'touchMove', [
          { x: grip.x - 20, y: grip.y + 20 },
          { x: grip.x + 60, y: grip.y + 20 },
        ]);
        await dispatchTouch(session, 'touchEnd', []);
        const afterPan = await page.evaluate(() => window.__spike?.pointerState());
        result.panChanged = (afterPan?.panXPx ?? 0) !== beforePan;

        // 6. Cancelled gesture must not leave stuck state.
        await dispatchTouch(session, 'touchStart', [grip]);
        await dispatchTouch(session, 'touchMove', [{ x: grip.x + 10, y: grip.y }]);
        await dispatchTouch(session, 'touchCancel', []);
        const afterCancel = await page.evaluate(() => window.__spike?.pointerState());
        result.modeAfterCancel = afterCancel?.mode ?? 'unknown';
        result.pointersAfterCancel = afterCancel?.activePointers ?? -1;
        await session.detach();
      }

      writeRaw(`mobile.${engine}.${testInfo.project.name}`, result);

      expect(result.tapLogged, 'tap selects').toBe(true);
      expect(result.touchActionNone, 'stage owns touch-action').toBe(true);
      expect(result.minHandleSizePx as number, 'touch target size').toBeGreaterThanOrEqual(
        result.targetMinPx as number,
      );
      if (cdpAvailable) {
        expect(result.dragMovedPx as number, 'one-finger drag moves the element').toBeGreaterThan(
          0,
        );
        expect(result.resizeLogged, 'touch resize handle').toBe(true);
        expect(result.rotateLogged, 'touch rotate handle').toBe(true);
        expect(result.zoomAfterPinch as number, 'pinch zooms').toBeGreaterThan(1);
        expect(result.panChanged, 'two-finger pan').toBe(true);
        expect(result.modeAfterCancel, 'no stuck gesture state').toBe('idle');
        expect(result.pointersAfterCancel as number, 'no leaked pointers').toBe(0);
      }
    });
  });
}
