import type { ContentPage } from '../content-page';
import { PAYMENT_POLICY } from './payment-policy';
import { POLICY_IDS, POLICY_SLUG, type PolicyId } from './policy-slugs';
import { PRIVACY_POLICY } from './privacy-policy';
import { RETURNS_POLICY } from './returns-policy';
import { SHIPPING_POLICY } from './shipping-policy';

/**
 * The one policy resolver (`APP11-S05`).
 *
 * `/chinh-sach/[slug]` is the only dynamic route S05 adds, and it is the only
 * place in the checkpoint where a URL segment reaches application code. So the
 * whole of its safety is this function: a slug either *is* one of four literal
 * strings and yields the static definition mapped to it, or it resolves to
 * `undefined` and the route calls `notFound()`.
 *
 * ## What the shape rules out
 *
 * A lookup on a frozen record with four known keys cannot be made to return
 * content the caller did not ask for. There is no database query, no API call,
 * no filesystem read, no template interpolation and no query-string branch
 * anywhere on this path, so a policy page cannot be steered by URL input: the
 * slug selects, it never *supplies*. `Object.prototype` keys are not a hazard
 * either — the map is a plain object literal read through a narrowing type
 * guard, and a slug such as `constructor` fails the guard before any lookup
 * happens rather than after.
 *
 * ## Unknown means not found, never redirected
 *
 * `/chinh-sach/khong-ton-tai` answers the same safe not-found the rest of the
 * Storefront answers for an unknown Product or gallery slug — no redirect to a
 * policy index, no "did you mean", no reflected slug. A redirect would advertise
 * that `/chinh-sach/<anything>` is a live address space and hand a crawler an
 * unbounded set of URLs that all resolve; a 404 tells it the truth, which is
 * that there are exactly four policies.
 */

/** The four definitions, keyed by canonical id. */
const POLICY_PAGES: Readonly<Record<PolicyId, ContentPage>> = {
  shipping: SHIPPING_POLICY,
  payment: PAYMENT_POLICY,
  returns: RETURNS_POLICY,
  privacy: PRIVACY_POLICY,
};

/** Slug → id, derived from the one slug lock so the two cannot diverge. */
const POLICY_ID_BY_SLUG = new Map<string, PolicyId>(POLICY_IDS.map((id) => [POLICY_SLUG[id], id]));

/**
 * The four policies in approved order. Consumed by the footer policy column and
 * by the S04 static sitemap inventory, so both advertise exactly what resolves.
 */
export const STOREFRONT_POLICY_PAGES: readonly ContentPage[] = POLICY_IDS.map(
  (id) => POLICY_PAGES[id],
);

/**
 * Resolves one policy page, or `undefined` for anything else.
 *
 * `slug` is whatever the router matched, which is arbitrary user input: an empty
 * string, a very long string, percent-encoding, a traversal attempt. All of them
 * take the same branch, because none of them is one of the four keys.
 */
export function getStorefrontPolicy(slug: string): ContentPage | undefined {
  const id = POLICY_ID_BY_SLUG.get(slug);
  return id === undefined ? undefined : POLICY_PAGES[id];
}
