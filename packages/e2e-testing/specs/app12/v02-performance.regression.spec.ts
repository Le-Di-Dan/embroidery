/**
 * `APP12-V02` §40 — the performance regression check for the surfaces V02 moved.
 *
 * ## What this is, and what it deliberately is not
 *
 * `APP12-H05` measured Core Web Vitals against a staging deployment and
 * `PO-APP12-005` set the thresholds. This is **not** that measurement repeated:
 * it is a regression check, on this checkpoint's disposable stack, over the
 * public Storefront surfaces V02 actually changed — the ones that gained a
 * responsive type scale, a two-column mobile gallery, a rebuilt product fold and
 * a rewritten content page.
 *
 * §40 asks whether the corrections cost anything measurable. The question a
 * layout change can fail is **CLS**, because that is the metric a reflow moves,
 * and `APP12-H05-C1` left it at ≤ 0.0008 with zero variance. LCP and TTFB are
 * recorded beside it so a regression in either cannot hide behind a passing CLS.
 *
 * The thresholds asserted are `PO-APP12-005`'s own, unchanged and not
 * reinterpreted here:
 *
 * ```text
 * CLS   0.10
 * LCP   2 500 ms
 * TTFB  800 ms
 * ```
 *
 * A laboratory number on one machine is not a field percentile, and this spec
 * claims none: it reports the median of three cold runs after a warm-up, which
 * is the `H05_MEASURED_RUNS` protocol the delivered runner already implements.
 *
 * ## Why the authenticated surfaces are not here
 *
 * The Admin order detail and the secure order surface both need a credential,
 * and `APP12-S03`/`APP12-H01` are explicit that a trace, video or HAR of a live
 * `ORDER_ACCESS` page writes secret-bearing material to disk. Their layout
 * changes are covered by the geometry ledger the V01 harness captures — which
 * measures document height, surface widths and overflow directly — rather than
 * by a probe that would need an authenticated context to be useful.
 */
import { expect, test } from '@playwright/test';

import { H05_VIEWPORTS, measureSurface } from '../../support/app12/h05-measurement-runner.mjs';

test.describe.configure({ mode: 'serial', timeout: 900_000 });

/** `PO-APP12-005`, quoted rather than restated. */
const THRESHOLDS = { cls: 0.1, lcpMs: 2_500, ttfbMs: 800 } as const;

/** The slug the S02 catalog fixture seeds, which every Wave-1 e2e run shares. */
const PRODUCT_SLUG = 'app12-s02-e2e-ao-thun';

/**
 * The four public surfaces this checkpoint changed, and what changed on each.
 *
 * Each one is here because a *layout* moved, which is the only kind of change
 * that can cost CLS.
 */
const SURFACES = [
  { id: 'home', path: '/', changed: 'the hero type scale now interpolates 32→64px' },
  {
    id: 'product-detail',
    path: `/san-pham/${PRODUCT_SLUG}`,
    changed: 'the fold was rebuilt as a two-column split above 1024',
  },
  { id: 'gallery-feed', path: '/bo-suu-tap', changed: 'two columns at 390, clamped card copy' },
  { id: 'services', path: '/dich-vu', changed: 'the content pass rewrote the page' },
] as const;

const results: Record<string, unknown>[] = [];

test.afterAll(() => {
  // Printed as one line per surface so the numbers land in the run log beside
  // the other APP12 ledgers rather than only in an assertion message.
  for (const row of results) {
    console.log(`[app12-v02-perf] ${JSON.stringify(row)}`);
  }
});

for (const viewportName of ['desktop', 'mobile'] as const) {
  for (const surface of SURFACES) {
    test(`${surface.id} @ ${viewportName} — ${surface.changed}`, async ({ browser, baseURL }) => {
      const measured = await measureSurface({
        browser,
        baseUrl: baseURL ?? '',
        surface: { id: surface.id, path: surface.path },
        viewport: H05_VIEWPORTS[viewportName],
      });

      results.push({
        surface: surface.id,
        viewport: viewportName,
        cls: measured.cls,
        lcpMs: measured.lcpMs,
        ttfbMs: measured.ttfbMs,
      });

      // `summarise` returns `null` when no run produced a value, which is a
      // real outcome — an unsupported entry type, or a navigation that never
      // settled — and is reported as absence rather than folded into a zero that
      // would pass every threshold below.
      expect(measured.cls, `${surface.id} produced a CLS reading`).not.toBeNull();
      expect(measured.lcpMs, `${surface.id} produced an LCP reading`).not.toBeNull();
      expect(measured.ttfbMs, `${surface.id} produced a TTFB reading`).not.toBeNull();

      // Every run answered, so a metric is never read off an error page.
      expect(measured.statuses, 'every measured navigation returned 200').toEqual(
        measured.statuses.map(() => 200),
      );

      // The **max** across the cold runs, not the median: a layout that shifts
      // on one load in three is still a layout that shifts, and `APP12-H05-C1`
      // left these surfaces with zero variance, so variance itself is the signal.
      expect(measured.cls?.max, `${surface.id} CLS stays under PO-APP12-005`).toBeLessThan(
        THRESHOLDS.cls,
      );
      expect(measured.lcpMs?.median, `${surface.id} LCP stays under PO-APP12-005`).toBeLessThan(
        THRESHOLDS.lcpMs,
      );
      expect(measured.ttfbMs?.median, `${surface.id} TTFB stays under PO-APP12-005`).toBeLessThan(
        THRESHOLDS.ttfbMs,
      );
    });
  }
}
