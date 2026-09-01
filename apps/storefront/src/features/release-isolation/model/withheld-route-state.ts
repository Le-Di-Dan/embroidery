import { isCustomEmbroideryReleased } from '../../../config/custom-embroidery-release';
import { isWithheldWave2Route } from './wave2-route-policy';

/**
 * Whether a customer-facing route is withheld *right now* (`APP12-G02` §9).
 *
 * The route gate in `src/proxy.ts` is what actually withholds a route. This is
 * the same question asked by presentation, so that no call to action advertises
 * an address the server will refuse. It reads the same flag and the same route
 * policy — one authority, consulted twice — rather than letting a component
 * carry its own idea of what is released.
 *
 * ## This is not the gate
 *
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §6 is explicit that hiding is not
 * withholding: suppressing a link stops nobody who types the URL, and a
 * navigation-only control is forbidden as a release mechanism. Nothing here
 * withholds anything. It exists only so a released Wave-1 shop does not point
 * customers at a `404` it created on purpose — a presentation consequence of the
 * gate, never a substitute for it. Deleting this file would change what a
 * visitor is *offered* and nothing about what they can *reach*.
 *
 * ## Server-only
 *
 * `isCustomEmbroideryReleased` reads `process.env`, so every caller must be a
 * Server Component. That is the correct constraint rather than an inconvenience:
 * a client-evaluated release state would have to be shipped to the browser, and
 * §4 forbids the browser holding the release decision.
 */
export function isCustomerRouteWithheld(route: string): boolean {
  return isWithheldWave2Route(route) && !isCustomEmbroideryReleased();
}
