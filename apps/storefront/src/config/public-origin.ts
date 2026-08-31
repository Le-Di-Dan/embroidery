/**
 * `STOREFRONT_PUBLIC_ORIGIN` — the absolute customer-facing browser origin, read
 * server-side by the Storefront's technical SEO surface (`APP11-S04`).
 *
 * ## One authority, two consumers
 *
 * The variable is not new and is not the Storefront's. `IMP-D050` / `APP4-B05`
 * locked it as the sole public browser-origin authority so the worker could mint
 * absolute secure links; S04 promotes the **same** variable into this app's
 * server runtime so `metadataBase`, `robots.txt` and `sitemap.xml` resolve
 * against the address a customer actually used. Both processes must mean the
 * identical thing by it, which is why nothing here re-interprets it.
 *
 * Four values in this repository look like they could serve, and none may:
 * `STOREFRONT_HOST` is a bare hostname the dev gateway routes on (no scheme, a
 * container-visible name); `INTERNAL_API_BASE_URL` is the API's address on the
 * compose network; `DESIGN_SESSION_ALLOWED_ORIGINS` and `STAFF_ALLOWED_ORIGINS`
 * are CSRF allowlists — *plural*, owned by other capabilities, and an allowlist
 * answers "may this origin call us", never "where do customers live". Promoting
 * any of them would make an unrelated operational change silently repoint every
 * canonical URL the store publishes.
 *
 * ## Public configuration, but not client configuration
 *
 * The origin is not a secret — it is printed in every canonical tag the store
 * serves. It is still read server-side only, with no `NEXT_PUBLIC_` twin: the
 * consumers are `generateMetadata`, a metadata route and a JSON-LD builder, all
 * of which run on the server, and a client copy would be a second declaration of
 * one authority that could drift from the first.
 *
 * ## No default, ever
 *
 * A wrong origin does not fail visibly. It publishes a canonical tag pointing at
 * someone else's host, advertises a sitemap nobody owns, and tells a crawler
 * that the real store is a duplicate of it. So there is no fallback, no
 * development default, no `localhost` guess and no `Host` header promotion:
 * missing or malformed configuration throws at the SEO consumer, and the route
 * fails rather than emitting a confidently wrong URL.
 *
 * ## The shape rules
 *
 * Preserved verbatim from the worker's contract, because two validators that
 * accept different values are two authorities. A URL is composed as
 * `<origin><path>`, so an origin carrying its own path, query or fragment would
 * produce an address that does not exist; credentials in the authority would put
 * a password in published markup.
 */

/** The one variable name. Written once so a typo is a compile-time rename. */
export const STOREFRONT_PUBLIC_ORIGIN_ENV = 'STOREFRONT_PUBLIC_ORIGIN';

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

/**
 * Validates and normalizes the configured origin.
 *
 * Returns the origin **without** a trailing slash, so composition with a route
 * path is a plain concatenation and cannot produce `//kham-pha`.
 *
 * Throws naming the variable, never the value. The origin is public
 * configuration rather than a secret, but a validator that echoed its input
 * would be the wrong habit to establish beside the ones that must not.
 */
/**
 * The variable bag this reads. Deliberately narrower than `NodeJS.ProcessEnv`,
 * which Next augments with required keys of its own: the validator wants nothing
 * but a name-to-value lookup, and a test proving that no lookalike variable can
 * satisfy the authority has to be able to pass a bag containing only that one.
 */
export type PublicOriginEnv = Readonly<Record<string, string | undefined>>;

export function loadStorefrontPublicOrigin(env: PublicOriginEnv): string {
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

/**
 * The configured origin for the current server process.
 *
 * Deliberately **not** memoized. The validator is a few string checks against a
 * value the process already holds, and caching it would mean a corrected
 * configuration needed a restart to take effect while a stale one kept being
 * published — the opposite of the fail-closed behaviour this module exists for.
 */
export function getStorefrontPublicOrigin(): string {
  return loadStorefrontPublicOrigin(process.env);
}

/**
 * Composes an absolute public URL from a root-relative application path.
 *
 * The path comes from a canonical route builder, never from a literal written at
 * the call site, and it must already start with `/` — an accidental relative
 * path would otherwise resolve against nothing and produce `https://hostpath`.
 */
export function toAbsolutePublicUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('A public URL path must be root-relative.');
  }
  return `${getStorefrontPublicOrigin()}${path}`;
}
