import {
  STOREFRONT_CHECKOUT_ROUTE_BASE,
  STOREFRONT_SECURE_ORDER_ROUTE,
} from './storefront-navigation';

/**
 * Which shell a route gets (`V01-UX-022`, `APP12-V02` §10).
 *
 * ## The defect
 *
 * The public shell composes a four-column store-presentation block above the
 * footer on **every** route, because `APP11-S05`'s responsive authority puts it
 * there at all three widths — which is right for a page someone is browsing.
 *
 * `V01-UX-022` measured what that costs on a page someone is *paying* on: about
 * a third of the checkout and of the secure order surface is a marketing footer
 * advertising a service the order is not for, beneath the one control the
 * customer came to use.
 *
 * ## The rule
 *
 * Two routes are transactional: the Ready-Made checkout and the secure order
 * surface. Both are places a customer has already decided; neither is a place to
 * offer them somewhere else to go. §10 keeps the brand, an escape path and
 * minimal policy/support access, and drops the marketing block.
 *
 * The contact dock is **not** dropped. It is the only support channel the
 * product has, and §10 is explicit that security and support information a
 * checkout or payment needs stays.
 *
 * ## Why a request header
 *
 * A Server Component cannot read the pathname, and the shell is composed by the
 * root layout for every route. The alternatives were a client component (which
 * would ship the whole shell to the browser to make one layout decision) or a
 * route-group restructure (which moves two route directories to change one
 * boolean). The proxy already clones the request headers on every request for
 * the CSP nonce, so this rides the seam that exists.
 *
 * The header is set by `src/proxy.ts` and read by the shell. Neither is a
 * security boundary: a forged value changes which footer a visitor sees and
 * nothing else, and the routes themselves are unchanged.
 */
export type StorefrontShellVariant = 'full' | 'transactional';

/** The request header the proxy stamps and the shell reads. */
export const SHELL_VARIANT_HEADER = 'x-storefront-shell';

/**
 * The route families that get the reduced shell.
 *
 * Prefixes, and deliberately: `/mua-hang/[slug]` and `/truy-cap/don-hang` are
 * both parameterised, and both may gain children. `/truy-cap` itself is **not**
 * listed — the secure-access landing serves both waves by scope, exactly as
 * `wave2-route-policy.ts` documents, and it is a place a visitor may still be
 * finding their way.
 */
export const TRANSACTIONAL_SHELL_ROUTES: readonly string[] = [
  STOREFRONT_CHECKOUT_ROUTE_BASE,
  STOREFRONT_SECURE_ORDER_ROUTE,
];

/** The shell a pathname earns. */
export function resolveShellVariant(pathname: string): StorefrontShellVariant {
  const isTransactional = TRANSACTIONAL_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return isTransactional ? 'transactional' : 'full';
}

/** The variant a stamped header names, defaulting to the full shell. */
export function readShellVariant(value: string | null | undefined): StorefrontShellVariant {
  return value === 'transactional' ? 'transactional' : 'full';
}
