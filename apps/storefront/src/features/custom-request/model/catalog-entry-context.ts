/**
 * How `/yeu-cau/moi` learns which catalog design the customer is submitting.
 *
 * ## Nothing here is typed by the customer
 *
 * `APP5-S01` §6.1 forbids an input for the product id, the variant id, the
 * design-session id, the customer id or the request code, and `650:3` states it
 * on the frame: *"product, variant and design come from the Studio session — you
 * enter no code here"*. So the context arrives two ways, neither of them a form
 * field:
 *
 * - the **placement** (product slug, side code, area code) travels in the query
 *   string, because it is exactly the public triple `APP3` already puts in URLs
 *   and none of the three is a credential;
 * - the **Design Session id** is then read from the Studio's own placement-keyed
 *   resume handle. It is not in the URL and must not be: `APP3-G03` allows a
 *   client to keep it under a namespaced key, and putting it in a link would put
 *   it in browser history and in every referrer header the page emits.
 *
 * The Session *secret* appears in neither path. It is a host-only `HttpOnly`
 * cookie the browser attaches to the submission by itself, which is why naming
 * the Session id here authorizes nothing on its own.
 *
 * ## Absence is a state, not a failure
 *
 * A visitor who reaches this route with no placement is simply not on the
 * catalog branch, and one whose handle is gone has no design to submit — the
 * approved `650:187` treatment. Both are ordinary outcomes of this function,
 * which is why it returns a discriminated result rather than throwing.
 */
import { readResumeHandle, type StudioResumeScope } from '../../design-studio';

/** The query parameters the Studio hands over. Public codes only. */
export const CATALOG_ENTRY_PARAMS = {
  productSlug: 'san-pham',
  sideCode: 'mat',
  areaCode: 'vung',
} as const;

export type CatalogEntryContext =
  /** No placement in the URL: this visit is not a catalog entry at all. */
  | { readonly kind: 'ABSENT' }
  /**
   * A placement, but no Session stored for it — the customer never designed
   * here, cleared storage, or the handle was dropped. `650:187`.
   */
  | { readonly kind: 'SESSION_MISSING'; readonly scope: StudioResumeScope }
  | {
      readonly kind: 'READY';
      readonly scope: StudioResumeScope;
      readonly designSessionId: string;
    };

function trimmedParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  const value = raw.trim();
  return value === '' ? undefined : value;
}

/**
 * Resolve the catalog entry context from a query string.
 *
 * A pure function of its two inputs so the three outcomes can be asserted
 * directly, rather than by rendering a route and hoping the right branch ran.
 */
export function resolveCatalogEntry(params: URLSearchParams): CatalogEntryContext {
  const productSlug = trimmedParam(params, CATALOG_ENTRY_PARAMS.productSlug);
  const sideCode = trimmedParam(params, CATALOG_ENTRY_PARAMS.sideCode);
  const areaCode = trimmedParam(params, CATALOG_ENTRY_PARAMS.areaCode);

  // All three or none: a partial placement addresses no handle, and guessing
  // the missing code would read a Session opened somewhere else on the garment.
  if (productSlug === undefined || sideCode === undefined || areaCode === undefined) {
    return { kind: 'ABSENT' };
  }

  const scope: StudioResumeScope = { productSlug, sideCode, areaCode };
  const designSessionId = readResumeHandle(scope);
  if (designSessionId === null) return { kind: 'SESSION_MISSING', scope };

  return { kind: 'READY', scope, designSessionId };
}
