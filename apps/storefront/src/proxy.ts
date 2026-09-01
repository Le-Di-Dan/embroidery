import { NextResponse, type NextRequest } from 'next/server';

import { isCustomEmbroideryReleased } from './config/custom-embroidery-release';
import { isWithheldWave2Route } from './features/release-isolation';

/**
 * The Storefront half of the Wave-2 release gate (`APP12-G02`).
 *
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §4 requires the release decision at the
 * route level **and**, independently, at the API level. This is the route level:
 * the seven delivered Wave-2 customer routes are refused before the custom
 * business surface behind them executes.
 *
 * ## Why the proxy, and not a guard inside each page
 *
 * Three properties the page-level alternative cannot give, all of them required.
 *
 * 1. **The refusal precedes the surface.** The proxy runs before routing
 *    resolves, so no Server Component for a withheld route is invoked, no
 *    server-side read is issued and no custom business surface is entered. A
 *    `notFound()` call inside a page has already run that page's module and
 *    whatever its layout does.
 * 2. **The transport is actually a denial.** This repository carries an open
 *    finding (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`) that a `notFound()` from a
 *    dynamic route can answer `200`. §7 asks for a verified transport status,
 *    not for rendered copy, so the gate must not be built on the mechanism that
 *    is known to under-report.
 * 3. **One decision, one place.** Seven page-level guards are seven chances for
 *    the eighth Wave-2 route to arrive unguarded.
 *
 * It is also not a navigation rule and not a JavaScript rule: a request with
 * scripting disabled, a direct paste of the URL, and a crawler that ignores
 * `robots.txt` all reach this function and all get the same answer (§6).
 *
 * ## What the customer sees
 *
 * The canonical not-found page, with a real `404`. The request is rewritten to a
 * path the App Router matches nothing for, so Next renders `app/not-found.tsx`
 * and sets the status itself — indistinguishable from any address that does not
 * exist on this host. §13's reasoning applies here as much as to the API: Wave 2
 * is not released, so from the outside there is nothing there, and a "custom
 * embroidery is coming soon" page would publish the release plan while §7
 * forbids a disabled-state surface being designed at all.
 *
 * The URL in the address bar is unchanged, because this is a rewrite rather than
 * a redirect. A redirect would announce that the route was recognised and
 * deliberately turned away.
 */

/**
 * The rewrite target: a reserved path with no route file and no possible
 * customer meaning. Its only job is to match nothing, which is what makes the
 * framework produce the not-found page and the `404` with it.
 */
const NOT_FOUND_REWRITE_PATH = '/_release-withheld';

/**
 * Limits the proxy to the paths that could possibly be withheld.
 *
 * A matcher is a performance boundary, never the gate: `isWithheldWave2Route` is
 * the authority and it is still asked for every path that arrives here. The
 * three prefixes are the three Wave-2 families of §2 — the custom-request flow,
 * the secure-access surfaces, and the per-Product Studio. `/san-pham` is matched
 * as a family because the Studio sits *beneath* a customer's slug, and the
 * policy — not this list — is what keeps `/san-pham/<slug>` itself released.
 */
export const config = {
  matcher: ['/yeu-cau/:path*', '/truy-cap/:path*', '/san-pham/:path*'],
};

export default function proxy(request: NextRequest): NextResponse {
  if (isCustomEmbroideryReleased()) {
    return NextResponse.next();
  }
  if (!isWithheldWave2Route(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE_PATH, request.nextUrl));
}
