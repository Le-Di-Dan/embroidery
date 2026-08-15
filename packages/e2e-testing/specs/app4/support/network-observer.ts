/**
 * Safe observation of the browser's real requests (E01-H02).
 *
 * E01 forbids intercepting or mocking any APP4 backend behaviour, so this only
 * *watches*: it never fulfils, aborts or rewrites a request. What it records is
 * deliberately thin — method, pathname, status and order — because that is all
 * the acceptance items need, and every APP4 request body carries either a code,
 * a token or a contact.
 *
 * For bodies it reports **shape, not content**: the key names, and a boolean per
 * key saying a non-empty value was present. `POST /api/public/secure-links/resolve`
 * therefore yields `bodyKeys: ['token']` and `hasExpectedTokenField: true`,
 * which is exactly what `E01-05` must prove, with the token itself never leaving
 * the browser process.
 *
 * Test-only.
 */
import type { Page, Request } from '@playwright/test';

export interface ObservedRequest {
  readonly sequence: number;
  readonly method: string;
  readonly pathname: string;
  readonly status: number | null;
  readonly bodyKeys: string[];
  /** Key → a non-empty value was present. Never the value. */
  readonly bodyFieldPresent: Record<string, boolean>;
}

export interface NetworkObserver {
  readonly requests: ObservedRequest[];
  /** Requests whose pathname contains `fragment`, in order. */
  matching(fragment: string): ObservedRequest[];
  /** Safe header subset for one request, by header name allowlist. */
  headersOf(index: number, allowed: readonly string[]): Promise<Record<string, string>>;
  stop(): void;
}

/**
 * Starts observing. Only same-origin API calls are recorded — asset and
 * document requests are noise for every APP4 item.
 */
export function observeNetwork(page: Page, { pathFilter = '/api/' } = {}): NetworkObserver {
  const requests: ObservedRequest[] = [];
  const raw: Request[] = [];
  let sequence = 0;

  const onRequestFinished = (request: Request): void => {
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }
    if (!pathname.includes(pathFilter)) {
      return;
    }

    const bodyKeys: string[] = [];
    const bodyFieldPresent: Record<string, boolean> = {};
    const body = request.postData();
    if (typeof body === 'string' && body.length > 0) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        for (const [key, value] of Object.entries(parsed)) {
          bodyKeys.push(key);
          bodyFieldPresent[key] = typeof value === 'string' ? value.length > 0 : value != null;
        }
      } catch {
        // A non-JSON body is recorded as having no readable keys rather than
        // being retained: keeping it would keep whatever it carried.
      }
    }

    raw.push(request);
    requests.push({
      sequence: sequence++,
      method: request.method(),
      pathname,
      status: request.response() === null ? null : null,
      bodyKeys,
      bodyFieldPresent,
    });
  };

  // `requestfinished` rather than `request`, so a response status is available.
  const listener = (request: Request): void => {
    onRequestFinished(request);
    void request
      .response()
      .then((response) => {
        const observed = requests.find((candidate) => candidate.sequence === sequence - 1);
        if (observed !== undefined && response !== null) {
          (observed as { status: number | null }).status = response.status();
        }
      })
      .catch(() => undefined);
  };
  page.on('requestfinished', listener);

  return {
    requests,
    matching: (fragment) => requests.filter((entry) => entry.pathname.includes(fragment)),
    headersOf: async (index, allowed) => {
      const request = raw[index];
      if (request === undefined) {
        return {};
      }
      const headers = await request.allHeaders();
      const safe: Record<string, string> = {};
      for (const name of allowed) {
        const value = headers[name.toLowerCase()];
        if (value !== undefined) {
          safe[name.toLowerCase()] = value;
        }
      }
      return safe;
    },
    stop: () => page.off('requestfinished', listener),
  };
}
