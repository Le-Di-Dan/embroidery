/**
 * The `APP12-H05` browser measurement runner.
 *
 * Drives a real Chromium against the production-mode staging deployment through
 * the real Gateway and TLS, and returns raw per-run numbers. It decides nothing:
 * thresholds, classification and the release verdict are applied by the caller
 * against `PO-APP12-005`, so this file cannot quietly weaken a target.
 *
 * ## The measurement model, stated rather than implied
 *
 * These are **laboratory** measurements on one machine (§2: `LAB_MEASUREMENT`,
 * `NOT_FIELD_CRUX`). Repetition here exists to expose variance and identify
 * stable regressions, not to synthesise a field p75 out of a handful of samples,
 * and the runner therefore reports min/median/max rather than a percentile it
 * has no right to claim.
 *
 * ## Cache state
 *
 * §11 requires both, and requires that cache not silently make media free.
 *
 * Each **cold** run gets a brand-new browser context, so it carries no HTTP
 * cache, no storage and no service worker.
 *
 * The **warm** run re-navigates **the same page object**, which is the one thing
 * that actually measures a repeat visit. A new page in the same context does
 * not: a Playwright context keeps no on-disk HTTP cache and each page starts
 * with an empty memory cache, so a "warm" reading taken that way re-transfers
 * every byte and reports zero cache benefit for assets that are in fact
 * `immutable`. That was measured directly before this was written — same page,
 * second navigation: `transferSize` 0 for every static chunk; new page, same
 * context: full re-transfer of all of them. Reporting the second as a warm
 * navigation would have blamed the application for the harness.
 */
import { installH05Probe, readH05Probe } from './h05-cwv-probe.mjs';

/** §8: a 1440-class desktop and a 390-class mobile. */
export const H05_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 }),
  mobile: Object.freeze({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }),
});

/** §10: one warm-up, then three measured runs. */
export const H05_WARMUP_RUNS = 1;
export const H05_MEASURED_RUNS = 3;

/** Classifies a response so the payload budget can be split by resource kind. */
function resourceKind(response) {
  const type = (response.headers()['content-type'] ?? '').split(';')[0].trim();
  if (type.startsWith('image/')) return 'image';
  if (type === 'text/css') return 'css';
  if (type.includes('javascript')) return 'script';
  if (type.startsWith('font/') || type.includes('font')) return 'font';
  if (type === 'text/html') return 'document';
  if (type.includes('json')) return 'xhr';
  return 'other';
}

/**
 * The payload budget, built from Resource Timing transfer sizes.
 *
 * Kinds come from the observed `content-type` where one was seen, because
 * `initiatorType` says who asked rather than what arrived; the initiator is the
 * fallback. The two figures are kept apart on purpose: `transferBytes` is what
 * crossed the network and is what a cache policy changes, `resourceBytes` is
 * what the page weighs however it was obtained.
 */
function payloadBudget(resources, kindByUrl) {
  const byKind = {};
  let transferBytes = 0;
  let resourceBytes = 0;
  let cachedCount = 0;
  for (const resource of resources) {
    const kind = kindByUrl.get(resource.name) ?? resource.initiatorType ?? 'other';
    byKind[kind] ??= { count: 0, transferBytes: 0, resourceBytes: 0, fromCache: 0 };
    byKind[kind].count += 1;
    byKind[kind].transferBytes += resource.transferSize;
    byKind[kind].resourceBytes += resource.decodedBodySize;
    if (resource.fromCache) {
      byKind[kind].fromCache += 1;
      cachedCount += 1;
    }
    transferBytes += resource.transferSize;
    resourceBytes += resource.decodedBodySize;
  }
  return { byKind, transferBytes, resourceBytes, cachedCount, resourceCount: resources.length };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** min / median / max over one metric across the measured runs. */
export function summarise(runs, pick) {
  const values = runs.map(pick).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return null;
  return {
    min: Number(Math.min(...values).toFixed(1)),
    median: Number(median(values).toFixed(1)),
    max: Number(Math.max(...values).toFixed(1)),
    samples: values.length,
  };
}

/**
 * Loads one URL in one context and returns that navigation's raw measurement.
 *
 * @param {{ context: unknown, url: string, interact?: Function, settleMs?: number }} params
 */
export async function measureNavigation({ context, url, interact, settleMs = 2500, warmRepeat = false }) {
  const page = await context.newPage();
  await page.addInitScript(installH05Probe);

  // Responses are observed only for their headers — kind and cache directive.
  // Their byte counts are NOT used; see `payloadBudget`.
  const requests = [];
  const kindByUrl = new Map();
  page.on('response', (response) => {
    kindByUrl.set(response.url(), resourceKind(response));
    requests.push({
      url: response.url(),
      status: response.status(),
      kind: resourceKind(response),
      cacheControl: response.headers()['cache-control'] ?? '',
      contentLength: Number(response.headers()['content-length'] ?? 0),
      contentEncoding: response.headers()['content-encoding'] ?? '',
    });
  });

  const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  // Let late media, lazy images and hydration land before the page is frozen;
  // LCP in particular is only final once the candidate stops changing.
  await page.waitForTimeout(settleMs);

  let interactionLabel = null;
  if (interact) {
    interactionLabel = await interact(page);
    // An interaction's `event` entries are only observable after the browser has
    // had a frame to dispatch and render them.
    await page.waitForTimeout(1200);
  }

  const probe = await page.evaluate(readH05Probe);

  // The repeat navigation, on the SAME page, so the browser's memory cache is
  // the one a returning visitor has. Measured before the page is closed.
  let warm = null;
  if (warmRepeat) {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(settleMs);
    const warmProbe = await page.evaluate(readH05Probe);
    const warmBudget = payloadBudget(warmProbe.resources, kindByUrl);
    warm = {
      ttfbMs: Number((warmProbe.ttfbMs ?? 0).toFixed(1)),
      lcpMs: Number((warmProbe.lcpMs ?? 0).toFixed(1)),
      requestCount: warmBudget.resourceCount + 1,
      transferBytes: warmBudget.transferBytes + (warmProbe.navigationTransferSize ?? 0),
      resourceBytes: warmBudget.resourceBytes,
      cachedCount: warmBudget.cachedCount,
      byKind: warmBudget.byKind,
    };
  }

  await page.close();

  const budget = payloadBudget(probe.resources, kindByUrl);
  const { resources, ...metrics } = probe;

  return {
    warm,
    status: response?.status() ?? 0,
    ...metrics,
    interactionLabel,
    // The document itself is a navigation, not a resource entry, so its bytes
    // are added explicitly or every page would under-report by its own HTML.
    requestCount: budget.resourceCount + 1,
    transferBytes: budget.transferBytes + (probe.navigationTransferSize ?? 0),
    resourceBytes: budget.resourceBytes,
    cachedCount: budget.cachedCount,
    byKind: budget.byKind,
    requests,
  };
}

/**
 * Runs the full repetition policy for one surface at one viewport.
 *
 * @param {{ browser: unknown, baseUrl: string, surface: object, viewport: object, log?: Function }} params
 */
export async function measureSurface({ browser, baseUrl, surface, viewport, log = () => {} }) {
  const url = `${baseUrl}${surface.path}`;
  const cold = [];
  let warm = null;

  for (let run = 0; run < H05_WARMUP_RUNS + H05_MEASURED_RUNS; run += 1) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      ignoreHTTPSErrors: true,
      // A brand-new context per run is what makes the run genuinely cold: no
      // HTTP cache, no storage, no service worker carried over (§11).
      storageState: surface.storageState ?? undefined,
    });
    try {
      // The warm/repeat navigation is taken once, on the last run only, inside
      // the same page that has just loaded the URL cold.
      const isLastRun = run === H05_WARMUP_RUNS + H05_MEASURED_RUNS - 1;
      const result = await measureNavigation({
        context,
        url,
        interact: surface.interact,
        settleMs: surface.settleMs,
        warmRepeat: isLastRun,
      });
      if (run >= H05_WARMUP_RUNS) cold.push(result);
      if (isLastRun) warm = result.warm;
    } finally {
      await context.close();
    }
  }

  log(
    `${surface.id} @ ${viewport.width}x${viewport.height}: ` +
      `LCP ${String(summarise(cold, (r) => r.lcpMs)?.median)}ms ` +
      `CLS ${String(summarise(cold, (r) => r.cls)?.median)} ` +
      `TTFB ${String(summarise(cold, (r) => r.ttfbMs)?.median)}ms`,
  );

  return {
    id: surface.id,
    path: surface.path,
    url,
    viewport: `${String(viewport.width)}x${String(viewport.height)}`,
    statuses: cold.map((run) => run.status),
    lcpMs: summarise(cold, (run) => run.lcpMs),
    cls: summarise(cold, (run) => run.cls),
    ttfbMs: summarise(cold, (run) => run.ttfbMs),
    interactionMs: summarise(cold, (run) => run.worstInteractionMs),
    requestCount: summarise(cold, (run) => run.requestCount),
    transferBytes: summarise(cold, (run) => run.transferBytes),
    resourceBytes: summarise(cold, (run) => run.resourceBytes),
    longTaskTimeMs: summarise(cold, (run) => run.longTaskTimeMs),
    interactionLabel: cold[0]?.interactionLabel ?? null,
    lcpUrl: cold[0]?.lcpUrl ?? '',
    lcpElement: cold[0]?.lcpElement ?? '',
    byKind: cold[0]?.byKind ?? {},
    warm,
    coldRuns: cold.map((run) => ({
      ttfbMs: Number(run.ttfbMs?.toFixed(1) ?? 0),
      lcpMs: Number(run.lcpMs.toFixed(1)),
      cls: Number(run.cls.toFixed(4)),
      requestCount: run.requestCount,
      transferBytes: run.transferBytes,
      worstInteractionMs: Number(run.worstInteractionMs.toFixed(1)),
    })),
    sampleRequests: (cold[0]?.requests ?? []).map((request) => ({
      url: request.url,
      status: request.status,
      kind: request.kind,
      cacheControl: request.cacheControl,
      contentLength: request.contentLength,
      contentEncoding: request.contentEncoding,
    })),
  };
}
