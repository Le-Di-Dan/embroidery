#!/usr/bin/env node
/**
 * `APP3-S03` — the production transform benchmark, on Chromium and WebKit.
 *
 * ## What it measures
 *
 * The **shipped** interaction: a real Session on the real Storefront route, the
 * real DOM handles, and one pointer move per animation frame — the frozen
 * `APP0-R01` gesture driver, so the numbers are comparable with the transform
 * p95 `ADR-APP0-001` §6 froze at **20 ms desktop**. Not helper arithmetic: a
 * candidate computed in isolation says nothing about whether validating,
 * committing and re-rendering a hundred-element scene fits in a frame.
 *
 * Each gesture is measured at all three production scene sizes, `M` included —
 * the question is whether cost scales with the scene, and skipping the middle
 * would leave it unanswered.
 *
 * ## One browser per invocation, on purpose
 *
 * `IMP-D043` PO-07 caps anonymous Session creation at **5 per hour per IP**,
 * with a burst of 2 per minute. Three scenes is three Sessions, so one browser
 * fits inside the guard and two do not. Rather than restart the API to clear an
 * in-memory counter — defeating an abuse control to make a benchmark pass — the
 * run takes a `--browser` argument and is invoked twice.
 *
 * ```text
 * node tools/smoke-app3-s01-trustworthy-origin.mjs apply
 * node tools/bench-app3-s03-fixtures.mjs seed
 * node tools/bench-app3-s03-transforms.mjs --browser=chromium
 * node tools/bench-app3-s03-transforms.mjs --browser=webkit
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
const { chromium, webkit } = requireFromE2E('@playwright/test');

import { PRODUCT_SLUG } from './smoke-app3-s01-fixtures.mjs';
import { SCENE_ELEMENT_COUNTS } from './bench-app3-s03-fixtures.mjs';

const BASE_URL = process.env.S03_BASE_URL ?? 'http://localhost';
const LAUNCHERS = { chromium, webkit };

/** The frozen APP0-R01 gesture length, so the p95 is comparable with the ADR's. */
const GESTURE_FRAMES = 60;
/** PO-07 also caps a burst at 2 creations per minute; three scenes need a wait. */
const CREATION_PAUSE_MS = 65_000;
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The in-page driver. A deliberate copy of the frozen `APP0-R01` conventions
 * rather than an import of them: `tools/check-spike-boundaries.mjs` forbids
 * production tooling from reaching into the spike, and it is the formulas that
 * have to match, not the module.
 */
const PROBE = `
window.__s03 = (() => {
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
  const at = (testId) => document.querySelector('[data-testid="' + testId + '"]');
  const send = (node, type, x, y) => node.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true }), {
      pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y,
    }),
  );

  return {
    domNodes: () => at('studio-stage-viewport')?.getElementsByTagName('*').length ?? 0,
    handleCount: () => document.querySelectorAll('[data-testid^="studio-transform-handle-"]').length,
    svgCount: () => document.querySelectorAll('svg').length,
    elementCount: () => document.querySelectorAll('[data-element-type]').length,
    /** The persisted transform of the selected element, read from the DOM. */
    selectedMatrix: (id) => at('studio-element-' + id)?.getAttribute('transform') ?? null,
    select: (id) => { at('studio-element-' + id)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); },

    /**
     * One gesture, driven one pointer move per frame and measured as the
     * frame-to-frame delta. Timing the wait instead of the work is the mistake
     * \`APP3-S07\` made and corrected: a double-rAF settle has a two-frame floor,
     * so every action measures the same number whatever it costs.
     */
    async measureGesture(kind, frames) {
      const overlay = at('studio-transform-overlay');
      const handle = kind === 'move'
        ? at('studio-transform-move')
        : kind === 'rotate'
          ? at('studio-transform-rotate')
          : at('studio-transform-handle-se');
      if (overlay === null || handle === null) return null;

      const tasks = longTasks();
      const durations = [];
      send(handle, 'pointerdown', 0, 0);
      let previous = await nextFrame();
      for (let index = 0; index < frames; index += 1) {
        // A small oscillation: large enough to change the document every frame,
        // small enough to stay inside the embroidery area so every candidate is
        // committed rather than refused.
        const swing = (index % 2 === 0 ? 1 : -1) * (1 + (index % 3));
        send(overlay, 'pointermove', swing, swing);
        const timestamp = await nextFrame();
        durations.push(timestamp - previous);
        previous = timestamp;
      }
      send(overlay, 'pointerup', 0, 0);
      return { ...summarize(durations), longTasks: tasks.stop() };
    },
  };
})();
`;

async function openStage(page, size) {
  await page.goto(`${BASE_URL}/san-pham/${PRODUCT_SLUG}/thiet-ke`, { waitUntil: 'networkidle' });
  // The customer's own path, driven the way a customer drives it: by the name
  // and the label on the screen. No test id is added to `APP3-S01`'s markup.
  await page
    .getByRole('button', { name: new RegExp(`S03 benchmark ${size}\\b`) })
    .click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dùng mẫu đã chọn' }).click();
  await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 30_000 });
  await page.evaluate(PROBE);
  await page.evaluate(() => window.__s03.select('bench-000'));
  await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });
}

async function measure(page, size) {
  const elements = SCENE_ELEMENT_COUNTS[size];
  const domNodes = await page.evaluate(() => window.__s03.domNodes());
  const handleCount = await page.evaluate(() => window.__s03.handleCount());
  const svgCount = await page.evaluate(() => window.__s03.svgCount());
  const rendered = await page.evaluate(() => window.__s03.elementCount());

  const gestures = {};
  for (const kind of ['move', 'resize', 'rotate']) {
    gestures[kind] = await page.evaluate(
      ([gesture, frames]) => window.__s03.measureGesture(gesture, frames),
      [kind, GESTURE_FRAMES],
    );
  }
  return { size, elements, rendered, domNodes, handleCount, svgCount, gestures };
}

async function run() {
  const requested = process.argv.find((argument) => argument.startsWith('--browser='));
  const name = requested?.split('=')[1] ?? 'chromium';
  const launcher = LAUNCHERS[name];
  if (launcher === undefined) {
    console.error(`unknown browser "${name}"; expected chromium or webkit`);
    process.exit(1);
  }

  const browser = await launcher.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  /*
   * An optional scene filter (`--scene=L`).
   *
   * The default is unchanged: all three sizes, because the question S03 asked is
   * whether cost scales with the scene and skipping the middle leaves it
   * unanswered. A *later* checkpoint that only touched the gesture seam needs a
   * bounded sanity run instead, and one scene is one Session rather than three —
   * which is what lets a before/after comparison fit inside the `IMP-D043` PO-07
   * cap rather than defeating it.
   */
  const scene = process.argv.find((argument) => argument.startsWith('--scene='))?.split('=')[1];
  const sizes = Object.keys(SCENE_ELEMENT_COUNTS).filter(
    (size) => scene === undefined || size === scene,
  );
  if (sizes.length === 0) {
    console.error(
      `unknown scene "${String(scene)}"; expected one of ${Object.keys(SCENE_ELEMENT_COUNTS).join(', ')}`,
    );
    process.exit(1);
  }

  const runs = [];
  let opened = 0;
  for (const size of sizes) {
    if (opened > 0) {
      console.log(`  (waiting ${String(CREATION_PAUSE_MS / 1000)}s for the PO-07 burst window)`);
      await new Promise((resolve) => setTimeout(resolve, CREATION_PAUSE_MS));
    }
    opened += 1;
    await openStage(page, size);
    const result = await measure(page, size);
    runs.push({ browser: name, ...result });
    console.log(
      [
        `${name} ${size} (${String(result.elements)} elements, ${String(result.domNodes)} DOM nodes, ${String(result.handleCount)} handles)`,
        ...['move', 'resize', 'rotate'].map(
          (kind) =>
            `  ${kind.padEnd(7)} p50 ${String(result.gestures[kind]?.p50)} p95 ${String(result.gestures[kind]?.p95)} dropped ${String(result.gestures[kind]?.dropped)}`,
        ),
      ].join('\n'),
    );
  }

  if (consoleErrors.length > 0) {
    console.error(`${name}: ${String(consoleErrors.length)} console error(s)`);
    for (const error of consoleErrors) console.error(`  ${error}`);
  }
  await browser.close();

  const output = process.env.S03_BENCH_OUTPUT ?? `app3-s03-transforms-${name}.json`;
  writeFileSync(output, `${JSON.stringify({ baseUrl: BASE_URL, runs }, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${output}`);

  // `ADR-APP0-001` §6: transform frame p95 ≤ 20 ms on desktop. Frozen, and this
  // checkpoint defines no looser one.
  const breaches = runs.filter((entry) =>
    Object.values(entry.gestures).some((stat) => (stat?.p95 ?? 0) > 20),
  );
  for (const breach of breaches) {
    console.error(`BUDGET: ${breach.browser} ${breach.size} exceeds the 20 ms p95 desktop budget`);
  }
  process.exit(breaches.length === 0 ? 0 : 1);
}

await run();
