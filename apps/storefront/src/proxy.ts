import { NextResponse, type NextRequest } from 'next/server';

import {
  SHELL_VARIANT_HEADER,
  resolveShellVariant,
} from './features/storefront-shell/model/shell-variant';

import {
  CONTENT_SECURITY_POLICY_HEADER,
  buildContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from './config/content-security-policy';
import { isCustomEmbroideryReleased } from './config/custom-embroidery-release';
import { isWithheldWave2Route } from './features/release-isolation';

/**
 * The Storefront request proxy. It carries two responsibilities, and carries
 * them together deliberately:
 *
 * 1. the Storefront half of the Wave-2 release gate (`APP12-G02`);
 * 2. the per-response Content-Security-Policy nonce (`APP12-H02` §19).
 *
 * `APP12-H02` §19 forbids a second middleware/proxy authority, and Next.js
 * allows exactly one per application anyway. So the nonce joins the gate here
 * rather than arriving as a parallel mechanism that could disagree with it.
 *
 * ## 1 — The Wave-2 release gate
 *
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §4 requires the release decision at the
 * route level **and**, independently, at the API level. This is the route level:
 * the seven delivered Wave-2 customer routes are refused before the custom
 * business surface behind them executes.
 *
 * Three properties a page-level guard cannot give, all of them required.
 *
 * 1. **The refusal precedes the surface.** The proxy runs before routing
 *    resolves, so no Server Component for a withheld route is invoked, no
 *    server-side read is issued and no custom business surface is entered. A
 *    `notFound()` call inside a page has already run that page's module and
 *    whatever its layout does.
 * 2. **The transport is actually a denial.** When this gate was built, a
 *    `notFound()` from a dynamic route was known to answer `200`
 *    (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`), so §7's demand for a verified
 *    transport status could not be met by the page-level mechanism. `APP12-H06`
 *    has since found the cause — a `loading.tsx` Suspense boundary flushing the
 *    HTTP head before the page can decide — and closed it, so `notFound()` now
 *    reports honestly. The argument for deciding here is **unchanged**: a
 *    rewrite is a denial that does not depend on which boundaries a segment
 *    happens to declare, and properties 1 and 3 were never about the status
 *    code at all.
 * 3. **One decision, one place.** Seven page-level guards are seven chances for
 *    the eighth Wave-2 route to arrive unguarded.
 *
 * It is also not a navigation rule and not a JavaScript rule: a request with
 * scripting disabled, a direct paste of the URL, and a crawler that ignores
 * `robots.txt` all reach this function and all get the same answer (§6).
 *
 * What the customer sees is the canonical not-found page with a real `404`. The
 * request is rewritten to a path the App Router matches nothing for, so Next
 * renders `app/not-found.tsx` and sets the status itself — indistinguishable
 * from any address that does not exist on this host. Wave 2 is not released, so
 * from the outside there is nothing there; a "coming soon" page would publish
 * the release plan while §7 forbids a disabled-state surface existing at all.
 * The address bar is unchanged because this is a rewrite, not a redirect: a
 * redirect would announce that the route was recognised and turned away.
 *
 * ## 2 — The CSP nonce
 *
 * Every response leaves here carrying a freshly minted nonce, published in the
 * `Content-Security-Policy` header **and** injected into the forwarded request
 * headers, which is where the App Router renderer looks for it (see
 * `config/content-security-policy.ts`). Both writes are required: the response
 * header is what the browser enforces, the request header is what makes the
 * framework's own inline scripts satisfy it.
 *
 * The nonce is applied on the withheld path too. The not-found page Next renders
 * for a rewritten Wave-2 route is a fully hydrated document like any other, and
 * a refusal served without a policy would be the one response an injection has a
 * free hand in.
 */

/**
 * The rewrite target: a reserved path with no route file and no possible
 * customer meaning. Its only job is to match nothing, which is what makes the
 * framework produce the not-found page and the `404` with it.
 */
const NOT_FOUND_REWRITE_PATH = '/_release-withheld';

/**
 * Which requests reach this function.
 *
 * Widened by `APP12-H02` from the three Wave-2 route families to every document
 * path, because the nonce is now minted here and a page the proxy never sees is
 * a page served with no policy at all. The exclusions are the three framework
 * asset families that execute nothing and therefore need no policy —
 * `_next/static`, `_next/image` and the favicon; `robots.txt`, `sitemap.xml`
 * and `/healthz` stay matched so no route the store publishes is uncovered.
 *
 * Widening it changes no release decision. A matcher was never the gate:
 * `isWithheldWave2Route` is the authority and it is asked for every path that
 * arrives, so the routes it withholds are exactly the routes it withheld before.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export default function proxy(request: NextRequest): NextResponse {
  const nonce = createContentSecurityPolicyNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isProduction: process.env.NODE_ENV === 'production',
  });

  // The renderer reads the policy off the *request*; the browser enforces it
  // off the response. Cloning the incoming headers preserves everything the
  // gateway forwarded (correlation id, forwarded-proto) rather than replacing it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  // Which shell the route gets (`V01-UX-022`, `APP12-V02` §10). A Server
  // Component cannot read the pathname, and this is the one place per request
  // that already has it and already clones the headers. Not a security
  // boundary: a forged value changes which footer a visitor sees and nothing
  // else — the route gate below is what withholds anything.
  requestHeaders.set(SHELL_VARIANT_HEADER, resolveShellVariant(request.nextUrl.pathname));
  const forward = { request: { headers: requestHeaders } };

  const withheld = !isCustomEmbroideryReleased() && isWithheldWave2Route(request.nextUrl.pathname);
  const response = withheld
    ? NextResponse.rewrite(new URL(NOT_FOUND_REWRITE_PATH, request.nextUrl), forward)
    : NextResponse.next(forward);

  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, policy);
  return response;
}
