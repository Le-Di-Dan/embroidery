/**
 * The shared security world for the `APP12-H01` live acceptance run.
 *
 * ## What it borrows, and why borrowing is the point
 *
 * The topology is `APP12-A02`'s, which is `APP12-S03`'s: a disposable database,
 * the real API, the real worker, the real Storefront, the real Admin, the real
 * gateway and this run's object storage. H01 needs exactly that universe — a
 * verified customer, a real order, a real `ORDER_ACCESS` grant, an authenticated
 * operator — and needs it to be *the delivered one*, because a security proof
 * against a harness-built approximation proves the harness.
 *
 * So `placeOrder`, `openSecureOrder` and the Admin driver are imported rather
 * than restated. What this module adds is the vocabulary a **security** run
 * needs and the acceptance ones did not: a CSP-violation recorder, a header
 * reader that never records a cookie, and probe helpers that address the API
 * directly with a credential the run legitimately holds.
 *
 * ## Nothing secret crosses this boundary, in either direction
 *
 * The `ORDER_ACCESS` token is the one credential these journeys must actually
 * hold — a cross-order probe with a fabricated token proves less than one with a
 * real credential pointed at the wrong object. It is read from the recording
 * worker adapter, passed to a probe, and never returned to a spec, never
 * asserted on, never put in a failure message and never written to a report.
 * Every assertion about it is a **boolean or a status code**, because
 * `expect(x).toBe(y)` prints its received value and the received value here
 * would be a live credential.
 *
 * The operator's password is read from this run's child environment — a
 * synthetic value the orchestrator minted in memory for this run alone — and
 * typed into the real form. It is never read from a shared `.env`, never logged
 * and never returned.
 */
import { expect, type APIRequestContext, type Page, type Response } from '@playwright/test';

/** A Content-Security-Policy violation, reduced to what an assertion may say. */
export interface CspViolation {
  readonly directive: string;
  readonly blocked: string;
}

/**
 * Starts recording CSP violations on a page, for the whole of its life.
 *
 * Chromium fires `securitypolicyviolation` on the document for every blocked
 * resource, inline script and eval. Registering through an init script rather
 * than `page.evaluate` after navigation is what makes this trustworthy: the
 * listener is installed before the document's own first script runs, so a
 * violation caused by hydration itself is caught rather than missed.
 *
 * The blocked URI is kept because it names a resource, never a credential.
 */
export async function recordCspViolations(page: Page): Promise<() => Promise<CspViolation[]>> {
  await page.addInitScript(() => {
    const store: CspViolation[] = [];
    (window as unknown as { __cspViolations: CspViolation[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });

  return async () =>
    page.evaluate(
      () => (window as unknown as { __cspViolations?: CspViolation[] }).__cspViolations ?? [],
    );
}

/**
 * The security headers on one response, with every credential-bearing name
 * removed before the value can reach a report.
 *
 * `set-cookie` is dropped by name rather than redacted: a redaction is a
 * decision about a value this function has already handled, and the safest
 * handling of a session cookie in a test artifact is never to hold it.
 */
export function securityHeadersOf(response: Response): Record<string, string> {
  const headers = response.headers();
  const wanted = [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'x-frame-options',
    'strict-transport-security',
    'x-powered-by',
    'cache-control',
    'server',
  ];
  const picked: Record<string, string> = {};
  for (const name of wanted) {
    const value = headers[name];
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

/**
 * The assertions every authenticated Admin 200 must satisfy.
 *
 * Stated once so the two screens cannot drift, and named so a failure says which
 * header was wrong rather than which index of an array.
 */
export function expectSecureDocumentHeaders(headers: Record<string, string>): void {
  const csp = headers['content-security-policy'];
  expect(csp, 'the document carries a Content-Security-Policy').toBeDefined();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("frame-ancestors 'self'");

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');

  // The H01 finding, asserted where it would come back.
  expect('x-powered-by' in headers, 'no response names the framework that served it').toBe(false);

  // The nginx build is not disclosed either.
  const server = headers['server'];
  if (server !== undefined) {
    expect(/\d/.test(server), 'the Server header carries no version').toBe(false);
  }
}

/**
 * The session cookie's transport policy, read from the browser context.
 *
 * Asserted against what **this** topology can support rather than against the
 * production ideal: the E2E gateway terminates plain HTTP, so `Secure` and the
 * `__Host-` prefix are correctly absent here and asserting them would be
 * asserting a lie. What must hold in every topology is `HttpOnly` and
 * `SameSite=Strict` — the two that make the cookie unreadable by script and
 * unattached to a cross-site request. The value is never read.
 */
export async function expectSessionCookiePolicy(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name.endsWith('adm_session'));
  expect(session, 'an Admin session cookie was issued').toBeDefined();
  expect(session?.httpOnly, 'the session cookie is HttpOnly').toBe(true);
  expect(session?.sameSite, 'the session cookie is SameSite=Strict').toBe('Strict');
  expect(session?.path).toBe('/');

  // Script cannot see it. This is the property `HttpOnly` exists for, checked
  // from the page rather than inferred from the attribute.
  const visibleToScript = await page.evaluate(() => document.cookie.includes('adm_session'));
  expect(visibleToScript, 'the session cookie is invisible to page script').toBe(false);
}

/**
 * One secure-surface probe, sent with a credential the run legitimately holds.
 *
 * Returns the status and the envelope code only. The token is an argument and
 * never a return value, so no caller can accidentally assert on it.
 */
export async function probeSecure(
  request: APIRequestContext,
  apiBaseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; code: string | undefined }> {
  const response = await request.post(`${apiBaseUrl}${path}`, {
    data: body,
    failOnStatusCode: false,
  });
  const payload = (await response.json().catch(() => ({}))) as { code?: string };
  return { status: response.status(), code: payload.code };
}

/**
 * The one refusal every unusable-credential probe must produce.
 *
 * `APP4-B06` requires unknown, expired, revoked, superseded, wrong-target and
 * wrong-scope to be externally identical, so this asserts the pair rather than
 * "not 200" — a `403` and a `404` would both be "not 200" and would also be an
 * oracle.
 */
export function expectIndistinguishableRefusal(
  outcome: { status: number; code: string | undefined },
  what: string,
): void {
  expect(outcome.status, `${what} is refused with the one secure status`).toBe(404);
  expect(outcome.code, `${what} is refused with the one secure code`).toBe(
    'SECURE_LINK_UNAVAILABLE',
  );
}

/** Reads a required per-run value from the child environment. Never a secret's home. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** This run's API origin, for the direct probes. */
export function apiBaseUrl(): string {
  return `${requiredEnv('E2E_BASE_STOREFRONT')}/api`;
}
