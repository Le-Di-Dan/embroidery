#!/usr/bin/env node
/**
 * `APP3-S07` — the production viewport benchmark, on Chromium and WebKit.
 *
 * ## What this exists to answer
 *
 * `ADR-APP0-001` accepted native SVG with one recorded risk and one named owner:
 *
 * ```text
 * WebKit re-rasterises the whole SVG on viewport scale —
 * zoom-gesture p95 41 ms desktop WebKit versus 16.7 ms Chromium.
 * Mitigation: step discretely and/or transform a wrapper. Owner: APP3-S07.
 * ```
 *
 * A structural gate can prove the code has no continuous scale in it. Only a
 * browser can prove that the thing a customer does is now cheap. So this runs
 * the **real** Storefront route, opens a **real** Session from a seeded Template,
 * and drives the **real** controls — no mounted component, no synthetic scene,
 * no arithmetic helper standing in for a render.
 *
 * ## Reproduce before claiming
 *
 * Each run measures two things on the same page, the same scene and the same
 * DOM:
 *
 * - `stepped` — what the shipped controls actually do: one discrete zoom step,
 *   one step back, Fit, and a bounded pan.
 * - `continuous` — the historical path, reproduced by writing sixty arbitrary
 *   scales straight onto the viewport layer, bypassing the controls.
 *
 * The second is not a regression to fix; it is the control group. Without it,
 * "WebKit is fine now" is indistinguishable from "this machine is fast today".
 *
 * ## Requirements
 *
 * The development stack, the `APP3-S01` trustworthy origin (a browser cannot
 * open a Session over a plain-HTTP non-loopback name), and the S/M/L fixtures:
 *
 * ```text
 * node tools/smoke-app3-s01-trustworthy-origin.mjs apply
 * node tools/bench-app3-s07-fixtures.mjs seed
 * node tools/bench-app3-s07-viewport.mjs
 * node tools/bench-app3-s07-fixtures.mjs revert
 * node tools/smoke-app3-s01-trustworthy-origin.mjs restore
 * ```
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The one pinned browser toolchain in the repository, reached through the
// package that already depends on it. Resolving it this way rather than adding
// a root dependency is deliberate: this checkpoint installs nothing, and there
// must not be a second Playwright version in the tree.
const requireFromE2E = createRequire(
  new URL('../packages/e2e-testing/package.json', import.meta.url),
);
const { chromium, webkit } = requireFromE2E('@playwright/test');

import { PRODUCT_SLUG } from './smoke-app3-s01-fixtures.mjs';
import { SCENE_ELEMENT_COUNTS } from './bench-app3-s07-fixtures.mjs';

// The trustworthy origin `CMD-SMOKE-APP3-S01-ORIGIN` serves the Storefront on.
// `http://localhost` is potentially trustworthy by definition, which is what
// lets a real browser open a Session at all — and WebKit resolves it natively,
// where it cannot resolve the gateway's custom development hostname.
const BASE_URL = process.env.S07_BASE_URL ?? 'http://localhost';
const OUTPUT = process.env.S07_BENCH_OUTPUT ?? 'app3-s07-viewport-bench.json';
const BROWSERS = [
  ['chromium', chromium],
  ['webkit', webkit],
];

/**
 * The scenes this run measures, and why it is not all three.
 *
 * `IMP-D043` PO-07 caps anonymous Session creation at **5 per hour per IP**,
 * and each measured scene is one real Session opened through the real route.
 * Three scenes across two browsers is six creations, which the guard refuses —
 * correctly. Rather than restart the API to clear an in-memory counter, which
 * would be defeating an abuse control to make a benchmark pass, the run is
 * designed to fit inside it: the smallest scene and the ceiling, on both
 * browsers, is four.
 *
 * `S` and `L` are also the two that carry the argument. `L` is the largest
 * scene a customer can ever have (`APP3-P01` caps a document at 100 elements),
 * and `S` is the floor that shows whether cost scales with the scene at all.
 * The `M` fixture is still seeded and can be measured on its own run.
 */
const MEASURED_SIZES = ['S', 'L'];

/** The frozen APP0-R01 gesture length, so the p95 is comparable with the ADR's. */
const GESTURE_FRAMES = 60;

/**
 * The pause between two Session creations.
 *
 * `IMP-D043` PO-07 also caps a *burst* at 2 creations per minute, on top of the
 * 5-per-hour ceiling. Four scenes opened back to back trip it, and the run then
 * fails on the third — which is the guard working correctly. Waiting it out is
 * the only honest way through: the alternative is restarting the API to clear an
 * in-memory counter, which is defeating an abuse control to make a benchmark
 * pass.
 */
const CREATION_PAUSE_MS = 65_000;
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The in-page measurement. Deliberately a copy of the frozen `APP0-R01`
 * conventions rather than an import of them: `tools/check-spike-boundaries.mjs`
 * forbids production tooling from reaching into the spike, and the formulas are
 * what has to match, not the module.
 */
const PROBE = `
window.__s07 = (() => {
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
  const settle = async () => { await nextFrame(); await nextFrame(); };
  const longTasks = () => {
    const durations = [];
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) durations.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch { observer = null; }
    return {
      stop: () => {
        observer?.disconnect();
        return {
          supported: observer !== null,
          count: durations.length,
          maxMs: round(durations.length === 0 ? 0 : Math.max(...durations)),
        };
      },
    };
  };

  const layer = () => document.querySelector('[data-testid="studio-stage-viewport-layer"]');
  const click = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.click();

  return {
    domNodes: () => document.querySelector('[data-testid="studio-stage-viewport"]')
      ?.getElementsByTagName('*').length ?? 0,
    svgCount: () => document.querySelectorAll('svg').length,

    /**
     * One action per animation frame, measured as the frame-to-frame delta.
     *
     * The first version of this timed "click, then await two rAFs", which has a
     * floor of two frames — every action measured 33.4 ms on a 60 Hz display,
     * including the deliberately expensive control, because what was being
     * measured was the wait and not the work. This is the driver APP0-R01
     * used for exactly that reason: the browser is asked to do the thing once
     * per frame, and the cost shows up as the frame it could not deliver.
     */
    async measureFrames(frames, step) {
      const tasks = longTasks();
      const durations = [];
      let previous = await nextFrame();
      for (let index = 0; index < frames; index += 1) {
        step(index);
        const timestamp = await nextFrame();
        durations.push(timestamp - previous);
        previous = timestamp;
      }
      return { ...summarize(durations), longTasks: tasks.stop() };
    },

    /** Zoom, stepped: in and out on alternate frames, never an arbitrary scale. */
    measureZoom(frames) {
      return this.measureFrames(frames, (index) =>
        click(index % 2 === 0 ? 'studio-zoom-in' : 'studio-zoom-out'),
      );
    },

    /** Fit, from a zoomed-in view, once per frame. */
    measureFit(frames) {
      return this.measureFrames(frames, (index) => {
        click(index % 2 === 0 ? 'studio-zoom-in' : 'studio-zoom-fit');
      });
    },

    /** A bounded pan: a real pointer drag on the stage surface, one move a frame. */
    async measurePan(frames) {
      const node = document.querySelector('[data-testid="studio-stage-viewport"]');
      if (node === null) return null;
      const send = (type, x, y) => node.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y,
        }),
      );
      send('pointerdown', 0, 0);
      const result = await this.measureFrames(frames, (index) => {
        send('pointermove', -index * 2, -index);
      });
      send('pointerup', 0, 0);
      return result;
    },

    /**
     * The historical continuous path, on the very same DOM.
     *
     * Writes an arbitrary scale straight onto the layer, once per frame,
     * bypassing every bound the shipped controls impose. This is what the ADR
     * measured at 41 ms p95, and it is the only honest baseline for saying the
     * stepped path is better.
     */
    async measureContinuous(frames) {
      const node = layer();
      if (node === null) return null;
      const original = node.style.transform;
      const result = await this.measureFrames(frames, (index) => {
        node.style.transform = 'translate(0%, 0%) scale(' + (1 + (index % 20) * 0.05) + ')';
      });
      node.style.transform = original;
      return result;
    },
  };
})();
`;

async function openStage(page, size) {
  await page.goto(`${BASE_URL}/san-pham/${PRODUCT_SLUG}/thiet-ke`, { waitUntil: 'networkidle' });
  // The Template picker, then the clone action — the customer's own path,
  // selected the way a customer selects it: by the name and the label on the
  // screen. `APP3-S01`'s markup carries no test ids and this benchmark does not
  // add any, because the run is only evidence if it drives the shipped UI.
  await page
    .getByRole('button', { name: new RegExp(`S07 benchmark ${size}\\b`) })
    .click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dùng mẫu đã chọn' }).click();
  await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 30_000 });
  await page.evaluate(PROBE);
}

async function measure(page, size) {
  const elements = SCENE_ELEMENT_COUNTS[size];
  const domNodes = await page.evaluate(() => window.__s07.domNodes());
  const svgCount = await page.evaluate(() => window.__s07.svgCount());

  const zoom = await page.evaluate((frames) => window.__s07.measureZoom(frames), GESTURE_FRAMES);
  const fit = await page.evaluate((frames) => window.__s07.measureFit(frames), GESTURE_FRAMES);

  await page.getByTestId('studio-zoom-in').click();
  await page.getByTestId('studio-zoom-in').click();
  const pan = await page.evaluate((frames) => window.__s07.measurePan(frames), GESTURE_FRAMES);
  const continuous = await page.evaluate(
    (frames) => window.__s07.measureContinuous(frames),
    GESTURE_FRAMES,
  );

  return { size, elements, domNodes, svgCount, stepped: { zoom, fit, pan }, continuous };
}

async function run() {
  const runs = [];
  let opened = 0;
  for (const [name, launcher] of BROWSERS) {
    const browser = await launcher.launch();
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    for (const size of MEASURED_SIZES) {
      if (opened > 0) {
        console.log(
          `  (waiting ${String(CREATION_PAUSE_MS / 1000)}s for the PO-07 creation burst window)`,
        );
        await new Promise((resolve) => setTimeout(resolve, CREATION_PAUSE_MS));
      }
      opened += 1;
      await openStage(page, size);
      const result = await measure(page, size);
      runs.push({ browser: name, ...result });
      console.log(
        [
          `${name} ${size} (${String(result.elements)} elements, ${String(result.domNodes)} DOM nodes)`,
          `  zoom step p50 ${String(result.stepped.zoom.p50)} p95 ${String(result.stepped.zoom.p95)} dropped ${String(result.stepped.zoom.dropped)}`,
          `  fit       p50 ${String(result.stepped.fit.p50)} p95 ${String(result.stepped.fit.p95)}`,
          `  pan       p50 ${String(result.stepped.pan?.p50)} p95 ${String(result.stepped.pan?.p95)}`,
          `  continuous (historical path) p95 ${String(result.continuous?.p95)}`,
        ].join('\n'),
      );
    }
    if (consoleErrors.length > 0) {
      console.error(`${name}: ${String(consoleErrors.length)} console error(s)`);
      for (const error of consoleErrors) console.error(`  ${error}`);
    }
    await browser.close();
  }

  writeFileSync(OUTPUT, `${JSON.stringify({ baseUrl: BASE_URL, runs }, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${OUTPUT}`);

  // The one budget this checkpoint owns, from `ADR-APP0-001` §6: a viewport
  // frame is a transform frame, and the desktop budget is 20 ms p95.
  const breaches = runs.filter((run) =>
    [run.stepped.zoom, run.stepped.fit].some((stat) => stat.p95 > 20),
  );
  for (const breach of breaches) {
    console.error(`BUDGET: ${breach.browser} ${breach.size} exceeds the 20 ms p95 desktop budget`);
  }
  process.exit(breaches.length === 0 ? 0 : 1);
}

await run();
