/**
 * `STOREFRONT_PUBLIC_ORIGIN` — the canonical public browser origin for absolute
 * APP4 secure links (`APP4-B05` authority unblock; `ADR-APP4-001` §11).
 *
 * ### Why a dedicated variable
 *
 * Four values in this repository look like they could serve, and none may:
 *
 * - `STOREFRONT_HOST` is a bare hostname the dev gateway routes on — no scheme,
 *   and it names a container-visible name, not the address a customer's browser
 *   used;
 * - `INTERNAL_API_BASE_URL` is the API's address on the compose network;
 * - `DESIGN_SESSION_ALLOWED_ORIGINS` and `STAFF_ALLOWED_ORIGINS` are CSRF
 *   allowlists — *plural*, owned by other capabilities, and an allowlist answers
 *   "may this origin call us", never "where do customers live".
 *
 * Promoting any of them would make an unrelated operational change silently
 * repoint every secure link that goes out.
 *
 * ### No default, ever
 *
 * A wrong origin does not fail visibly — it mints a link that looks correct and
 * lands the customer's token on someone else's host, in a URL fragment that the
 * receiving page is free to read. So there is no fallback, no development
 * default and no "localhost if unset": missing configuration fails closed at the
 * rendering boundary and the delivery retries until an operator publishes one.
 *
 * ### The shape rules exist to protect the fragment
 *
 * The link is composed as `<origin><landing>#t=<token>`. An origin carrying its
 * own query or fragment would put the token after an existing `#`, turning the
 * fragment into `#foo?t=…` or dropping it entirely; an origin with a path would
 * produce a route that does not exist; credentials in the authority would put a
 * password in every outbound message. Each is rejected here rather than
 * discovered in a customer's inbox.
 */

import type { SecureLinkLanding } from '@embroidery/notification-delivery';

export const STOREFRONT_PUBLIC_ORIGIN_ENV = 'STOREFRONT_PUBLIC_ORIGIN';

/**
 * Where each grant scope's secure link lands (`APP12-S03-C1`).
 *
 * A closed table keyed by {@link SecureLinkLanding}, not a path parameter: the
 * only paths a secure link may ever carry are the two written here, and neither
 * the API, the envelope nor a caller can introduce a third. `Record` rather
 * than a lookup with a default, so adding a grant scope fails to compile until
 * somebody decides where it lands — a default would silently route the new
 * scope to an existing surface, which is the exact defect this table replaces.
 *
 * `REQUEST_ACCESS` is IMP-D049 PO-05 (`route.storefront.secureLinkLanding`),
 * unchanged. `ORDER_ACCESS` is the Ready-Made order surface `APP12-S03`
 * delivered; before this correction its links were composed with the
 * `REQUEST_ACCESS` path, which the order surface does not serve and the
 * custom-request surface refuses as wrong-scope.
 */
export const SECURE_LINK_LANDING_PATHS: Readonly<Record<SecureLinkLanding, string>> = {
  REQUEST_ACCESS: '/truy-cap',
  ORDER_ACCESS: '/truy-cap/don-hang',
};

/** The fragment parameter the landing page reads (`secure_link.fragmentParameter`). */
export const SECURE_LINK_FRAGMENT_PREFIX = '#t=';

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

/**
 * Validates and normalizes the configured origin.
 *
 * Returns the origin **without** a trailing slash, so composition is a plain
 * concatenation and cannot produce `//truy-cap`.
 *
 * Throws naming the variable, never the value: the origin is public
 * configuration rather than a secret, but a validator that echoed its input
 * would be the wrong habit to establish beside three that must not.
 */
export function loadStorefrontPublicOrigin(env: NodeJS.ProcessEnv): string {
  const raw = env[STOREFRONT_PUBLIC_ORIGIN_ENV];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} is not set.`);
  }

  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} is not an absolute URL.`);
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must use https: or http:.`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must not carry credentials.`);
  }
  if (url.search !== '') {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must not carry a query.`);
  }
  // `URL` drops a fragment from `href` only after parsing it, so an origin
  // written with one has to be rejected explicitly rather than silently cleaned:
  // the author meant something by it, and whatever they meant is not this.
  if (url.hash !== '' || value.includes('#')) {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must not carry a fragment.`);
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must not carry a path.`);
  }
  if (url.hostname === '') {
    throw new Error(`${STOREFRONT_PUBLIC_ORIGIN_ENV} must include a host.`);
  }

  // `URL.origin` is already scheme + host + non-default port with no trailing
  // slash — the normalized form, computed rather than string-trimmed.
  return url.origin;
}
