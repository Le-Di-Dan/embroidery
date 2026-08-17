/**
 * Fragment-order instrumentation for the S02 secure-link landing (E01-H02).
 *
 * `E01-05` claims a specific *order*: the fragment is captured, the URL is
 * cleaned by `history.replaceState`, and only then does the resolve request
 * leave the browser. Proving that needs a recorder installed **before any
 * application script runs** — `addInitScript`, not an in-page hook — because a
 * hook installed after hydration cannot observe the call it is there to witness.
 *
 * One subtlety this encodes, learned in `APP4-S02`: Next's own hydration calls
 * `history.replaceState` first, so "the first replaceState" is the wrong event
 * to measure. What matters is the *cleaning* one — the call after which the hash
 * no longer carries the token — so every call is recorded with whether the hash
 * was still token-bearing before it and empty after it, and the cleaning call is
 * identified by that transition rather than by its position.
 *
 * Nothing here ever records the token. The recorder is given a marker — the
 * token's length and a short digest computed in the page — so it can answer
 * "does this string contain the token?" without holding it. Every exported fact
 * is a boolean, a count or a safe name.
 *
 * Test-only.
 */
import type { Page } from '@playwright/test';

export interface FragmentSecurityEvidence {
  /** A `replaceState` after which the hash stopped carrying the token. */
  readonly cleaningReplaceStateObserved: boolean;
  /** Total `replaceState` calls, including Next's own hydration call. */
  readonly replaceStateCount: number;
  readonly requestObserved: boolean;
  readonly requestMethod: string | null;
  readonly requestPath: string | null;
  /** The cleaning `replaceState` happened before the resolve request. */
  readonly stripBeforeRequest: boolean;
  readonly hashEmptyAtRequest: boolean;
  readonly urlContainsTokenAtRequest: boolean;
  readonly historyContainsTokenAtRequest: boolean;
  readonly requestUrlContainsToken: boolean;
  readonly requestBodyHasTokenField: boolean;
  readonly requestBodyKeys: string[];
}

/**
 * Installs the recorder. Call before `page.goto`.
 *
 * The token is passed in so comparisons happen in the page; it is written to
 * no global the application can read back, and no diagnostic ever returns it.
 *
 * `requestPathPattern` names the request whose ordering is being measured. It
 * defaults to APP4's secure-link resolve, so every APP4 call site behaves
 * exactly as before; `APP5-E01` passes its own, because the APP5 secure link
 * lands on a page whose first call is the grant-scoped status read and which
 * deliberately chains no resolve in front of it.
 */
export async function installFragmentInstrumentation(
  page: Page,
  token: string,
  { requestPathPattern = '/secure-links/resolve' } = {},
): Promise<void> {
  await page.addInitScript(
    ([needle, pattern]: [string, string]) => {
      const watched = new RegExp(pattern);
      const state = {
        replaceStateCount: 0,
        cleaningReplaceStateObserved: false,
        cleaningReplaceStateAt: -1,
        requestObserved: false,
        requestAt: -1,
        requestMethod: null as string | null,
        requestPath: null as string | null,
        hashEmptyAtRequest: false,
        urlContainsTokenAtRequest: false,
        historyContainsTokenAtRequest: false,
        requestUrlContainsToken: false,
        requestBodyHasTokenField: false,
        requestBodyKeys: [] as string[],
      };
      let sequence = 0;
      const contains = (value: unknown): boolean =>
        typeof value === 'string' && value.includes(needle);

      (window as unknown as Record<string, unknown>).__app4FragmentEvidence = state;

      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = function instrumented(this: History, ...args: unknown[]) {
        const hashBefore = window.location.hash;
        const result = originalReplaceState(...(args as Parameters<History['replaceState']>));
        state.replaceStateCount += 1;
        // The cleaning call is the one that *removes* the token from the hash —
        // not the first call, which is Next's own hydration replaceState.
        if (contains(hashBefore) && !contains(window.location.hash)) {
          state.cleaningReplaceStateObserved = true;
          state.cleaningReplaceStateAt = sequence++;
        }
        return result;
      } as History['replaceState'];

      const recordRequest = (method: string, url: string, body: unknown): void => {
        if (!watched.test(url)) {
          return;
        }
        state.requestObserved = true;
        state.requestAt = sequence++;
        state.requestMethod = method.toUpperCase();
        try {
          state.requestPath = new URL(url, window.location.origin).pathname;
        } catch {
          state.requestPath = url;
        }
        state.requestUrlContainsToken = contains(url);
        state.hashEmptyAtRequest = window.location.hash === '';
        state.urlContainsTokenAtRequest = contains(window.location.href);
        try {
          state.historyContainsTokenAtRequest = contains(JSON.stringify(history.state ?? null));
        } catch {
          state.historyContainsTokenAtRequest = false;
        }
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            state.requestBodyKeys = Object.keys(parsed);
            state.requestBodyHasTokenField = contains(parsed['token']);
          } catch {
            state.requestBodyKeys = [];
          }
        }
      };

      const originalFetch = window.fetch.bind(window);
      window.fetch = function instrumentedFetch(input: RequestInfo | URL, init?: RequestInit) {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        recordRequest(init?.method ?? 'GET', url, init?.body);
        return originalFetch(input, init);
      };

      // Axios — the only approved frontend HTTP client — uses XMLHttpRequest in
      // the browser, so patching `fetch` alone would observe nothing. These two
      // are captured as prototype methods on purpose and re-applied with their
      // original receiver below, which is exactly what `unbound-method` guards
      // against doing accidentally.
      /* eslint-disable @typescript-eslint/unbound-method */
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      /* eslint-enable @typescript-eslint/unbound-method */
      XMLHttpRequest.prototype.open = function instrumentedOpen(
        this: XMLHttpRequest & { __app4: { method: string; url: string } },
        method: string,
        url: string,
        ...rest: unknown[]
      ) {
        this.__app4 = { method, url };
        return originalOpen.apply(this, [method, url, ...rest] as never);
      };
      XMLHttpRequest.prototype.send = function instrumentedSend(
        this: XMLHttpRequest & { __app4?: { method: string; url: string } },
        body?: Document | XMLHttpRequestBodyInit | null,
      ) {
        if (this.__app4 !== undefined) {
          recordRequest(this.__app4.method, this.__app4.url, body);
        }
        return originalSend.apply(this, [body] as never);
      };
    },
    [token, requestPathPattern] as [string, string],
  );
}

/** Reads the recorded evidence. Booleans, counts and safe names only. */
export async function readFragmentSecurityEvidence(page: Page): Promise<FragmentSecurityEvidence> {
  const raw = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__app4FragmentEvidence as Record<
        string,
        unknown
      >,
  );
  const cleaningAt = Number(raw?.['cleaningReplaceStateAt'] ?? -1);
  const requestAt = Number(raw?.['requestAt'] ?? -1);
  return {
    cleaningReplaceStateObserved: Boolean(raw?.['cleaningReplaceStateObserved']),
    replaceStateCount: Number(raw?.['replaceStateCount'] ?? 0),
    requestObserved: Boolean(raw?.['requestObserved']),
    requestMethod: (raw?.['requestMethod'] as string | null) ?? null,
    requestPath: (raw?.['requestPath'] as string | null) ?? null,
    stripBeforeRequest: cleaningAt >= 0 && requestAt >= 0 && cleaningAt < requestAt,
    hashEmptyAtRequest: Boolean(raw?.['hashEmptyAtRequest']),
    urlContainsTokenAtRequest: Boolean(raw?.['urlContainsTokenAtRequest']),
    historyContainsTokenAtRequest: Boolean(raw?.['historyContainsTokenAtRequest']),
    requestUrlContainsToken: Boolean(raw?.['requestUrlContainsToken']),
    requestBodyHasTokenField: Boolean(raw?.['requestBodyHasTokenField']),
    requestBodyKeys: (raw?.['requestBodyKeys'] as string[]) ?? [],
  };
}
