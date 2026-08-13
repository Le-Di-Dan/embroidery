#!/usr/bin/env node
/**
 * `APP3-S11` — the mobile touch benchmark.
 *
 * `APP0` assigns benchmark responsibility to `S02`, `S03`, `S07`, **`S11`** and
 * `E01`, and this is S11's half: the interactions a finger drives at 390, on a
 * real Session and the real route, measured the way `APP3-S03` measures a
 * pointer gesture — one contact move per animation frame, timed as the
 * frame-to-frame delta.
 *
 * ## What it is honest about
 *
 * This is **emulation**, and it says so in its own output. A device pixel ratio,
 * a 390×844 viewport and a synthetic pointer contact are not a finger: they do
 * not carry a real digitizer's sampling rate, a real compositor's touch-ahead
 * behaviour or a real phone's thermal state. What emulation *can* answer is
 * whether the work this checkpoint added fits in a frame at the accepted scene
 * sizes, and that is the question asked here. Physical-device evidence is not
 * claimed anywhere in this file or its report.
 *
 * ## Two runs, one browser each, inside the Session cap
 *
 * `IMP-D043` PO-07 caps anonymous Session creation at 5 per hour per IP with a
 * burst of 2 per minute, so this takes a `--scene` argument and opens one
 * Session per invocation rather than restarting the API to clear a counter.
 *
 * ```text
 * node tools/smoke-app3-s01-trustworthy-origin.mjs apply
 * node tools/bench-app3-s03-fixtures.mjs seed
 * node tools/bench-app3-s11-touch.mjs --scene=L
 * node tools/bench-app3-s03-fixtures.mjs revert
 * node tools/smoke-app3-s01-trustworthy-origin.mjs restore
 * ```
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The one pinned browser toolchain in the repository, reached through the
// package that already depends on it: this checkpoint installs nothing.
const requireFromE2E = createRequire(
  new URL('../packages/e2e-testing/package.json', import.meta.url),
);
const { chromium } = requireFromE2E('@playwright/test');

import { PRODUCT_SLUG } from './smoke-app3-s01-fixtures.mjs';
import { SCENE_ELEMENT_COUNTS } from './bench-app3-s03-fixtures.mjs';

const BASE_URL = process.env.S11_BASE_URL ?? 'http://localhost';
/** The frozen `APP0-R01` gesture length, so a p95 here is comparable with S03's. */
const GESTURE_FRAMES = 60;
/** `610:242`'s own frame. A mobile context, with touch and a phone pixel ratio. */
const VIEWPORT = { width: 390, height: 844 };

/**
 * The in-page driver.
 *
 * A deliberate copy of the frozen `APP0-R01` conventions rather than an import
 * of them: `tools/check-spike-boundaries.mjs` forbids production tooling from
 * reaching into the spike, and it is the formulas that have to match.
 */
const PROBE = `
window.__s11 = (() => {
  const round = (v) => Math.round(v * 100) / 100;
  const percentile = (values, fraction) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
    return sorted[index] ?? 0;
  };
  const summarize = (values) => ({
    samples: values.length,
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    max: round(values.length === 0 ? 0 : Math.max(...values)),
    dropped: values.filter((v) => v > 33.4).length,
    slow: values.filter((v) => v > 20).length,
  });
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const at = (testId) => document.querySelector('[data-testid="' + testId + '"]');
  const touch = (node, type, pointerId, x, y) => node.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: y,
    }),
  );

  return {
    toolbarCount: () => document.querySelectorAll('[data-testid="studio-mobile-toolbar"]').length,
    railCount: () => document.querySelectorAll('[data-testid="studio-history-rail"]').length,
    svgCount: () => document.querySelectorAll('svg').length,
    domNodes: () => at('studio-stage-viewport')?.getElementsByTagName('*').length ?? 0,
    select: (id) => { at('studio-element-' + id)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); },

    /** One tap, measured from the contact to the frame the selection paints in. */
    async measureTap(id) {
      const durations = [];
      for (let index = 0; index < 20; index += 1) {
        const node = at('studio-element-' + id);
        if (node === null) return null;
        const start = performance.now();
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await nextFrame();
        durations.push(performance.now() - start);
      }
      return summarize(durations);
    },

    /** A one-finger drag on the selected element: the S03 gesture, driven by touch. */
    async measureMove(frames) {
      const overlay = at('studio-transform-overlay');
      const surface = at('studio-transform-move');
      if (overlay === null || surface === null) return null;
      const durations = [];
      touch(surface, 'pointerdown', 1, 0, 0);
      let previous = await nextFrame();
      for (let index = 0; index < frames; index += 1) {
        const swing = (index % 2 === 0 ? 1 : -1) * (1 + (index % 3));
        touch(overlay, 'pointermove', 1, swing, swing);
        const timestamp = await nextFrame();
        durations.push(timestamp - previous);
        previous = timestamp;
      }
      touch(overlay, 'pointerup', 1, 0, 0);
      return summarize(durations);
    },

    /** A two-finger gesture: 'pinch' changes the separation, 'pan' moves both. */
    async measureViewport(kind, frames) {
      const surface = at('studio-stage-viewport');
      if (surface === null) return null;
      const durations = [];
      touch(surface, 'pointerdown', 1, 100, 400);
      touch(surface, 'pointerdown', 2, 290, 400);
      let previous = await nextFrame();
      for (let index = 0; index < frames; index += 1) {
        const step = index * 2;
        if (kind === 'pinch') {
          touch(surface, 'pointermove', 1, 100 - step, 400);
          touch(surface, 'pointermove', 2, 290 + step, 400);
        } else {
          touch(surface, 'pointermove', 1, 100 + step, 400);
          touch(surface, 'pointermove', 2, 290 + step, 400);
        }
        const timestamp = await nextFrame();
        durations.push(timestamp - previous);
        previous = timestamp;
      }
      touch(surface, 'pointerup', 1, 0, 400);
      touch(surface, 'pointerup', 2, 0, 400);
      return summarize(durations);
    },

    /** Opening and closing a sheet, which mounts and unmounts a modal over the stage. */
    async measureSheet(testId, rounds) {
      const durations = [];
      for (let index = 0; index < rounds; index += 1) {
        const open = at(testId);
        if (open === null) return null;
        let start = performance.now();
        open.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await nextFrame();
        durations.push(performance.now() - start);
        const close = at(testId);
        start = performance.now();
        close?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await nextFrame();
        durations.push(performance.now() - start);
      }
      return summarize(durations);
    },

    /** One reorder press, which is one APP3-S04 command and one history entry. */
    async measureReorder(rounds) {
      const durations = [];
      for (let index = 0; index < rounds; index += 1) {
        const button = document.querySelector('[data-testid^="studio-mobile-layer-down-"]:not([disabled])')
          ?? document.querySelector('[data-testid^="studio-mobile-layer-up-"]:not([disabled])');
        if (button === null) return null;
        const start = performance.now();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await nextFrame();
        durations.push(performance.now() - start);
      }
      return summarize(durations);
    },
  };
})();
`;

async function openStage(page, size) {
  await page.goto(`${BASE_URL}/san-pham/${PRODUCT_SLUG}/thiet-ke`, { waitUntil: 'networkidle' });
  // The customer's own path, driven the way a customer drives it: by the name
  // and the label on the screen.
  await page
    .getByRole('button', { name: new RegExp(`S03 benchmark ${size}\\b`) })
    .click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dùng mẫu đã chọn' }).click();
  await page.waitForSelector('[data-testid="studio-mobile-toolbar"]', { timeout: 30_000 });
  await page.evaluate(PROBE);
}

async function measure(page, size) {
  const shell = await page.evaluate(() => ({
    toolbars: window.__s11.toolbarCount(),
    rails: window.__s11.railCount(),
    svgs: window.__s11.svgCount(),
    domNodes: window.__s11.domNodes(),
  }));

  const tap = await page.evaluate(() => window.__s11.measureTap('bench-000'));
  await page.evaluate(() => window.__s11.select('bench-000'));
  await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });

  const move = await page.evaluate((frames) => window.__s11.measureMove(frames), GESTURE_FRAMES);
  const pinch = await page.evaluate(
    (frames) => window.__s11.measureViewport('pinch', frames),
    GESTURE_FRAMES,
  );
  const pan = await page.evaluate(
    (frames) => window.__s11.measureViewport('pan', frames),
    GESTURE_FRAMES,
  );
  const sheet = await page.evaluate(() => window.__s11.measureSheet('studio-mobile-layers', 10));
  // The layer sheet has to be open for its own rows to exist.
  await page.click('[data-testid="studio-mobile-layers"]');
  const reorder = await page.evaluate(() => window.__s11.measureReorder(10));

  return {
    size,
    elements: SCENE_ELEMENT_COUNTS[size],
    shell,
    tap,
    move,
    pinch,
    pan,
    sheet,
    reorder,
  };
}

async function run() {
  const scene =
    process.argv.find((argument) => argument.startsWith('--scene='))?.split('=')[1] ?? 'L';
  if (SCENE_ELEMENT_COUNTS[scene] === undefined) {
    console.error(
      `unknown scene "${scene}"; expected one of ${Object.keys(SCENE_ELEMENT_COUNTS).join(', ')}`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch();
  /*
   * A mobile touch context, stated as emulation.
   *
   * `hasTouch` makes the platform report a touch device so the Studio's own tier
   * logic and the browser's `touch-action` handling behave as they do on a
   * phone. It does not make this a phone, and the report says so.
   */
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await openStage(page, scene);
  const result = await measure(page, scene);

  console.log(
    [
      `chromium (emulated touch) ${scene} — ${String(result.elements)} elements, ${String(result.shell.domNodes)} DOM nodes`,
      `  shell     toolbars ${String(result.shell.toolbars)} rails ${String(result.shell.rails)} svg ${String(result.shell.svgs)}`,
      ...['tap', 'move', 'pinch', 'pan', 'sheet', 'reorder'].map(
        (kind) =>
          `  ${kind.padEnd(9)} p50 ${String(result[kind]?.p50)} p95 ${String(result[kind]?.p95)} dropped ${String(result[kind]?.dropped)}`,
      ),
    ].join('\n'),
  );

  if (consoleErrors.length > 0) {
    console.error(`${String(consoleErrors.length)} console error(s)`);
    for (const error of consoleErrors) console.error(`  ${error}`);
  }
  await browser.close();

  const output = process.env.S11_BENCH_OUTPUT ?? `app3-s11-touch-${scene}.json`;
  writeFileSync(
    output,
    `${JSON.stringify({ baseUrl: BASE_URL, emulated: true, physicalDevice: false, run: result }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nwrote ${output}`);
  console.log('NOTE: emulated touch. This is not physical-device evidence.');

  // `ADR-APP0-001` §6 froze a 20 ms p95 for a transform frame. The same budget is
  // reported against here rather than a looser mobile one being invented.
  for (const kind of ['move', 'pinch', 'pan']) {
    if ((result[kind]?.p95 ?? 0) > 20) {
      console.error(`BUDGET: ${kind} p95 ${String(result[kind]?.p95)} exceeds the 20 ms budget`);
      process.exitCode = 1;
    }
  }
}

await run();
