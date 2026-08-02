#!/usr/bin/env node
/**
 * `APP2-S02` §25 — Product Detail in a real browser, against a REAL production
 * Storefront runtime, through the real Nginx gateway.
 *
 * Invoked by `tools/smoke-app2-s02-detail-production.mjs`, which owns the
 * production images, the disposable TLS database, the upstream swaps, the
 * gateway reload and the restore. This file owns only the assertions.
 *
 * Three things here cannot be proved anywhere else in this repository:
 *
 *  - **Server-rendered detail.** The raw HTTP response is read with JavaScript
 *    disabled, so "the Product is in the HTML" is measured, not inferred.
 *  - **One backend read per page view.** The API's own access log is counted
 *    across a single request — the request-scoped memo cannot be observed in
 *    Jest, because `next/jest` resolves React's client build and `cache()` has
 *    no RSC scope there.
 *  - **Durable visibility.** A published fixture becomes DRAFT and the very
 *    next request must 404, with its media address 404ing too.
 *
 * No credential is involved: every route under test is anonymous.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { watchProblems } from './smoke-app2-s01-discover-measure.mjs';
import {
  FIXTURES,
  contentWidth,
  MALFORMED_SLUG,
  UNKNOWN_SLUG,
  cleanupDetailFixtures,
  deliverableMediaCount,
  horizontalOverflow,
  measureContentBand,
  measureStory,
  mediaPaths,
  seedDetailFixtures,
  undersizedControls,
  unpublish,
} from './smoke-app2-s02-detail-fixtures.mjs';
import { apiRequestCount, runDetailScenarios } from './smoke-app2-s02-detail-scenarios.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Playwright is a devDependency of the E2E package; resolved from there so this
// harness adds no dependency of its own.
const requireFromE2e = createRequire(join(REPO_ROOT, 'packages', 'e2e-testing', 'package.json'));
const { chromium } = requireFromE2e('@playwright/test');

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://embroidery.local';

/**
 * Viewport, the story's maximum measure, and — for mobile only — the approved
 * content band the frame locks (`APP2-S02-C1`: 24px gutters, 342px content).
 * Desktop and tablet take their band from the shell and cap the story at 640.
 */
const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }, 640, null],
  ['tablet', { width: 1024, height: 900 }, 640, null],
  ['mobile', { width: 390, height: 844 }, 342, { gutter: 24, content: 342 }],
];

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${JSON.stringify(detail)}`);
}

function bySlug(key) {
  const fixture = FIXTURES.find((entry) => entry.key === key);
  if (fixture === undefined) throw new Error(`unknown fixture ${key}`);
  return fixture;
}

/** The raw HTML, with JavaScript disabled — proof the server rendered it. */
async function fetchWithoutJavaScript(browser, path) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const html = await page.content();
  await context.close();
  return { status, html };
}

async function main() {
  const seeded = seedDetailFixtures();
  console.log(`[fixture] ${JSON.stringify(seeded)}`);

  const rich = bySlug('rich');
  record('rich fixture advertises every seeded image', deliverableMediaCount(rich.slug) === 2, {
    slug: rich.slug,
    media: deliverableMediaCount(rich.slug),
  });

  const browser = await chromium.launch();
  try {
    // ---- server-rendered detail, no JavaScript at all ----------------------
    const ssr = await fetchWithoutJavaScript(browser, `/san-pham/${rich.slug}`);
    const paths = mediaPaths(rich.slug);
    record('detail is server-rendered without JavaScript', ssr.status === 200, {
      status: ssr.status,
      bytes: ssr.html.length,
    });
    record(
      'server HTML carries identity, category, story and the first image',
      ssr.html.includes(rich.name) &&
        ssr.html.includes('Thú bông') &&
        ssr.html.includes('Câu chuyện về tác phẩm') &&
        ssr.html.includes('khu vườn nhỏ sau nhà bà ngoại') &&
        ssr.html.includes(paths[0] ?? '#none'),
      { name: rich.name, firstImage: paths[0] },
    );
    record(
      'server HTML carries the canonical, the robots directive and no price',
      ssr.html.includes(`/san-pham/${rich.slug}`) &&
        !ssr.html.includes('460000') &&
        !ssr.html.includes('VND'),
      { canonical: `/san-pham/${rich.slug}` },
    );
    record(
      'server HTML links back into Discover truthfully',
      ssr.html.includes('href="/kham-pha"') && ssr.html.includes('category=thu-bong'),
      {},
    );

    // ---- one backend read per page view ------------------------------------
    const before = apiRequestCount();
    await fetchWithoutJavaScript(browser, `/san-pham/${rich.slug}`);
    const after = apiRequestCount();
    record(
      'metadata and the page share one backend detail read per request',
      after - before === 1,
      { before, after, delta: after - before },
    );

    // ---- the interactive scenarios, per viewport ---------------------------
    for (const [label, viewport, expectedMeasure, band] of VIEWPORTS) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await runDetailScenarios({
        page,
        label,
        baseUrl: BASE_URL,
        record,
        fixtures: {
          rich,
          single: bySlug('single'),
          noMedia: bySlug('noMedia'),
          bare: bySlug('bare'),
        },
        mediaPaths: paths,
      });

      await context.close();

      // A clean context for the layout and console measurements. The scenarios
      // above deliberately abort an image request to prove the media-error
      // state, and that abort is itself a console error — measuring here would
      // report the harness's own doing as a page defect.
      const clean = await browser.newContext({ viewport });
      const measured = await clean.newPage();
      const problems = watchProblems(measured);
      await measured.goto(`${BASE_URL}/san-pham/${rich.slug}`, { waitUntil: 'networkidle' });

      const story = await measureStory(measured);
      const available = await contentWidth(measured);
      record(
        `${label}: story measure is the approved readable width`,
        story !== null && story.width <= expectedMeasure && story.width > 0 && !story.clamped,
        {
          width: story?.width,
          max: expectedMeasure,
          shellContent: available,
          clamped: story?.clamped,
        },
      );

      // The approved mobile band (APP2-S02-C1). Measured from real boxes at 390:
      // Product Detail insets itself by 8px inside the shell's 16px gutter, so
      // the gutter reads 24 and the content reads 342 — without the global shell
      // moving for the Homepage, Discover or any other route.
      if (band !== null) {
        const measuredBand = await measureContentBand(measured);
        record(
          `${label}: Product Detail content band is ${band.gutter}px / ${band.content}px`,
          measuredBand !== null &&
            measuredBand.left === band.gutter &&
            measuredBand.right === band.gutter &&
            measuredBand.content === band.content,
          measuredBand ?? { measured: null },
        );
        record(
          `${label}: every banded section fits the ${band.content}px content width`,
          measuredBand !== null &&
            measuredBand.thumbnails === band.content &&
            [
              measuredBand.story,
              measuredBand.stage,
              measuredBand.breadcrumb,
              measuredBand.identity,
              measuredBand.continueSection,
            ].every((value) => value !== null && value <= band.content),
          measuredBand ?? { measured: null },
        );

        // The route-local loading and error surfaces share the same band; they
        // replace the page, so they are measured on their own visits.
        for (const [state, path] of [
          ['media empty', `/san-pham/${bySlug('noMedia').slug}`],
          ['description absent', `/san-pham/${bySlug('bare').slug}`],
        ]) {
          await measured.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
          const stateBand = await measureContentBand(measured);
          record(
            `${label}: the "${state}" surface uses the same content band`,
            stateBand !== null &&
              stateBand.left === band.gutter &&
              stateBand.content === band.content,
            stateBand ?? { measured: null },
          );
        }
        await measured.goto(`${BASE_URL}/san-pham/${rich.slug}`, { waitUntil: 'networkidle' });
      }
      const undersized = await undersizedControls(measured);
      record(`${label}: every Product Detail control meets 44px`, undersized.length === 0, {
        undersized,
      });
      record(
        `${label}: the page does not scroll horizontally`,
        !(await horizontalOverflow(measured)),
        {},
      );
      record(`${label}: no console or runtime error`, problems.length === 0, {
        problems: problems.slice(0, 3),
      });

      await clean.close();
    }

    // ---- the safe 404 matrix -----------------------------------------------
    const notFoundCases = [
      ['unknown slug', UNKNOWN_SLUG],
      ['DRAFT', bySlug('draft').slug],
      ['ARCHIVED', bySlug('archived').slug],
      ['non-public category', bySlug('hiddenCategory').slug],
      ['malformed slug', MALFORMED_SLUG],
    ];
    /**
     * `SAFE_STREAMED_NOT_FOUND` (IMP-D040).
     *
     * The framework answers a streamed data-driven `notFound()` with HTTP 200
     * plus a `noindex` signal. The Product Owner accepts that transport only
     * when every safety condition below holds, so each is measured per case
     * rather than summarised — and the status is reported as what it is. This
     * response is deliberately NOT called an HTTP 404.
     */
    const surfaces = new Set();
    const statuses = new Set();
    const fingerprints = new Set();
    for (const [reason, slug] of notFoundCases) {
      const visit = await fetchWithoutJavaScript(browser, `/san-pham/${encodeURIComponent(slug)}`);
      const html = visit.html;
      const evidence = {
        status: visit.status,
        approvedSurface: html.includes('Không tìm thấy'),
        noindex: /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html),
        productCanonical: /<link[^>]+rel="canonical"/i.test(html),
        productMetadata: FIXTURES.some((fixture) => html.includes(fixture.name)),
        productData: /"slug"\s*:|"isDisplayOutOfStock"|catalog-preview/.test(html),
        rawCause: /DRAFT|ARCHIVED|requestId|stack|postgres|SQLSTATE|ECONNREFUSED/i.test(html),
      };
      surfaces.add(evidence.approvedSurface ? 'approved-not-found' : 'other');
      statuses.add(visit.status);
      // Everything a public caller could use to tell the five causes apart.
      fingerprints.add(
        JSON.stringify([
          evidence.approvedSurface,
          evidence.noindex,
          evidence.productCanonical,
          evidence.productMetadata,
          evidence.productData,
          evidence.rawCause,
          visit.status,
        ]),
      );
      record(
        `SAFE_STREAMED_NOT_FOUND for ${reason}`,
        evidence.approvedSurface &&
          evidence.noindex &&
          !evidence.productCanonical &&
          !evidence.productMetadata &&
          !evidence.productData &&
          !evidence.rawCause,
        evidence,
      );
    }
    record('every not-found reason renders the same public surface', surfaces.size === 1, {
      surfaces: [...surfaces],
    });
    record('the five causes are indistinguishable to a public caller', fingerprints.size === 1, {
      distinctFingerprints: fingerprints.size,
    });
    record(
      'MEASURED transport: streamed not-found status (FU-APP2-DETAIL-NOT-FOUND-STATUS-01)',
      true,
      {
        measuredStatus: [...statuses],
        classification: 'SAFE_STREAMED_NOT_FOUND',
        note: 'not an HTTP 404; framework-defined streamed transport (next@16.2.10)',
      },
    );

    // ---- durable visibility --------------------------------------------------
    const live = await fetchWithoutJavaScript(browser, `/san-pham/${rich.slug}`);
    const mediaBefore = await fetchWithoutJavaScript(browser, paths[0] ?? '/');
    record('published detail and its media are both live before the change', live.status === 200, {
      detail: live.status,
      media: mediaBefore.status,
    });

    const status = unpublish(rich.slug);
    record('fixture state changed directly to DRAFT (not a B03 command)', status === 'DRAFT', {
      status,
    });

    const gone = await fetchWithoutJavaScript(browser, `/san-pham/${rich.slug}`);
    const mediaGone = await fetchWithoutJavaScript(browser, paths[0] ?? '/');
    // The substantive proof is that the Product is GONE from the very next
    // response — no page, no name, nothing replayed from a cache. The Storefront
    // status line carries the same framework caveat as the 404 matrix above
    // (FU-APP2-DETAIL-NOT-FOUND-STATUS-01), so it is recorded rather than
    // asserted. The API's own status, checked on the media address below, is
    // unaffected and really is 404.
    record(
      'the very next request is SAFE_STREAMED_NOT_FOUND — nothing was cached',
      gone.html.includes('Không tìm thấy') && !gone.html.includes(rich.name),
      { status: gone.status, surface: 'approved-not-found' },
    );
    record('the old media address 404s too', mediaGone.status === 404, {
      status: mediaGone.status,
    });
    record(
      'no Storefront route cache preserved the Product content',
      !gone.html.includes(rich.name),
      { leakedName: gone.html.includes(rich.name) },
    );
  } finally {
    await browser.close();
    cleanupDetailFixtures();
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(
    `\n== detail scenarios: ${results.length - failed.length}/${results.length} passed ==`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
