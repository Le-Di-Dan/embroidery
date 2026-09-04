/**
 * The in-page Core Web Vitals probe for `APP12-H05`.
 *
 * ## Why this is hand-written rather than a library
 *
 * `APP12-H05` §9 asks for LCP, CLS, INP or the closest supported
 * browser-measured interaction latency, TTFB and navigation timing, captured in
 * a real Chromium through the staging Gateway. Every one of those is a native
 * `PerformanceObserver` entry type in Chromium, so the measurement is the
 * browser's own — a library would add a CDN dependency the artifact-free
 * measurement does not need and would not make the numbers more real.
 *
 * ## What each number is, precisely
 *
 * - **TTFB** — `responseStart - requestStart` on the navigation entry. Server
 *   think-time plus network, and deliberately NOT `startTime`-relative, which
 *   would fold redirect and connection setup into a server metric.
 * - **LCP** — the LAST `largest-contentful-paint` entry before the page is
 *   frozen. LCP is defined as the final candidate, so taking the first would
 *   report a text placeholder that an image later replaced.
 * - **CLS** — the largest *session window* of `layout-shift` entries without
 *   recent input, gapped at 1s and capped at 5s, which is the metric's own
 *   definition. Summing every shift instead would over-report any long page.
 * - **INP** — the worst `event` entry duration after a real interaction. §9
 *   requires an interaction to have occurred; with one interaction this is the
 *   interaction's latency rather than a p98 over many, and the report says so.
 *
 * The script is injected before any page script runs, so no entry that occurs
 * during the initial render can be missed.
 */

/** Injected via `addInitScript`; must be a single self-contained function. */
export function installH05Probe() {
  const state = {
    lcp: 0,
    lcpElement: '',
    lcpUrl: '',
    shifts: [],
    interactions: [],
    longTasks: 0,
    longTaskTime: 0,
  };
  Object.defineProperty(window, '__h05', { value: state, configurable: false });

  const observe = (type, handler, extra) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(handler)).observe({
        type,
        buffered: true,
        ...extra,
      });
    } catch {
      /* An unsupported entry type is reported as absent, never as zero. */
      state[`unsupported_${type}`] = true;
    }
  };

  observe('largest-contentful-paint', (entry) => {
    state.lcp = entry.startTime;
    state.lcpUrl = entry.url ?? '';
    state.lcpElement = entry.element?.tagName ?? '';
  });

  observe('layout-shift', (entry) => {
    if (entry.hadRecentInput) return;
    state.shifts.push({ value: entry.value, time: entry.startTime });
  });

  observe('event', (entry) => {
    state.interactions.push({ name: entry.name, duration: entry.duration });
  }, { durationThreshold: 16 });

  observe('longtask', (entry) => {
    state.longTasks += 1;
    state.longTaskTime += entry.duration;
  });
}

/**
 * Evaluated in the page after the surface has settled; returns plain data.
 *
 * Payload comes from the Resource Timing API rather than from response bodies
 * observed on the wire, because only `transferSize` distinguishes a byte that
 * crossed the network from one the browser already had. A response-body count
 * reports a cache hit at full weight, which would make the warm navigation look
 * identical to the cold one and would answer `FU-APP11-B03-02` with a number
 * that cannot tell the two apart — the exact trap §11 warns about.
 */
export function readH05Probe() {
  const state = window.__h05 ?? {};
  const navigation = performance.getEntriesByType('navigation')[0];

  const resources = performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
    durationMs: entry.duration,
    // A resource served from cache reports `transferSize` 0 (or, for a 304, a
    // small header-only figure well under the encoded body).
    fromCache: entry.transferSize === 0 && entry.decodedBodySize > 0,
  }));

  // CLS session windows: 1s gap, 5s cap — the metric's own definition.
  let best = 0;
  let current = 0;
  let windowStart = 0;
  let previous = 0;
  for (const shift of state.shifts ?? []) {
    if (current > 0 && (shift.time - previous > 1000 || shift.time - windowStart > 5000)) {
      current = 0;
      windowStart = shift.time;
    }
    if (current === 0) windowStart = shift.time;
    current += shift.value;
    previous = shift.time;
    if (current > best) best = current;
  }

  const interactions = state.interactions ?? [];
  const worst = interactions.reduce((max, item) => Math.max(max, item.duration), 0);

  return {
    ttfbMs: navigation ? navigation.responseStart - navigation.requestStart : null,
    responseEndMs: navigation ? navigation.responseEnd - navigation.requestStart : null,
    domContentLoadedMs: navigation ? navigation.domContentLoadedEventEnd - navigation.startTime : null,
    loadEventMs: navigation ? navigation.loadEventEnd - navigation.startTime : null,
    transferSizeBytes: navigation ? navigation.transferSize : null,
    lcpMs: state.lcp ?? 0,
    lcpUrl: state.lcpUrl ?? '',
    lcpElement: state.lcpElement ?? '',
    cls: best,
    shiftCount: (state.shifts ?? []).length,
    interactionCount: interactions.length,
    worstInteractionMs: worst,
    longTasks: state.longTasks ?? 0,
    longTaskTimeMs: state.longTaskTime ?? 0,
    navigationTransferSize: navigation ? navigation.transferSize : 0,
    resources,
  };
}
