/**
 * The canonical store-fact boundary (`APP11-S05`).
 *
 * ## The audit this file records
 *
 * `APP11-D01` drew the Local page and the footer store-presentation block with
 * explicit placeholders — `[Địa chỉ xưởng — giá trị canonical chưa có]` and
 * three like it — because no canonical address, opening hours, phone number or
 * e-mail existed at design time, and `APP11-D01-C1` §D.2 recorded that the
 * Product Owner would supply them before this checkpoint.
 *
 * `APP11-S05` re-ran that audit against repository authority:
 *
 * ```text
 * docs/01-PRODUCT-REQUIREMENTS.md   requires a Local/store page; states no value
 * docs/02-SCOPE-AND-BOUNDARIES.md   multi-branch out of scope (hence one store)
 * docs/08-SEO-AND-CONTENT.md        requires the page type; states no value
 * .env.example                      no address/hours/phone/e-mail variable
 *
 * CANONICAL_STORE_ADDRESS        = NOT_AVAILABLE
 * CANONICAL_OPENING_HOURS        = NOT_AVAILABLE
 * CANONICAL_PHONE                = NOT_AVAILABLE
 * CANONICAL_EMAIL                = NOT_AVAILABLE
 * ```
 *
 * ## Therefore: no canonical value, no published fact
 *
 * A store address, an opening-hours line, a phone number and an e-mail address
 * are the four facts on this site a visitor would act on physically — drive
 * somewhere, ring someone. A wrong one is not a cosmetic defect, and every
 * available way of "filling the gap" is worse than the gap: the D01 placeholder
 * text would ship bracketed design notes to customers, `TBD` and `example.com`
 * are visibly broken, and an invented plausible address is the only option that
 * fails silently — which makes it the most dangerous of the four.
 *
 * So an unavailable fact is **omitted entirely**. The Local page and the footer
 * both render only the rows this module returns, and both degrade to a truthful
 * reduced composition that says how to reach the store through the request and
 * contact channels that genuinely exist.
 *
 * ## The shape is real even though the values are absent
 *
 * This is not speculative structure: the Local page and the footer already need
 * the same four rows, resolved identically, and the Product Owner supplying a
 * value later must be a one-line change in this file that lights up both
 * surfaces at once — never a hunt for four hard-coded strings. That is the same
 * reason `resolveExternalContactUrl` exists for the dock's two URLs.
 *
 * ## What this module will not do
 *
 * It reads no environment variable. A store address is public business copy
 * decided by the Product Owner in a reviewable document, not deployment
 * configuration, and routing it through `process.env` would put a customer-
 * facing fact somewhere no review or diff can see it — the opposite of what
 * `.env` governance is for (CLAUDE.md §8a). When the values arrive they become
 * literals below, in a commit a reviewer reads.
 */

/** Which of the four facts a row carries. */
export type StoreFactId = 'address' | 'openingHours' | 'phone' | 'email';

/** How a resolved value is rendered: plain text, or a `tel:`/`mailto:` link. */
export type StoreFactLinkKind = 'tel' | 'mailto';

/** One canonical, publishable store fact. */
export interface StoreFact {
  readonly id: StoreFactId;
  /** Row label — `Địa chỉ`, `Điện thoại`, … */
  readonly label: string;
  /** The exact canonical value, rendered verbatim. */
  readonly value: string;
  /** Absent for plain text; `tel`/`mailto` makes the value actionable. */
  readonly linkKind?: StoreFactLinkKind;
  /**
   * The `href` target when `linkKind` is set. Held separately from `value` so
   * the visible text stays the human-readable form the Product Owner wrote
   * while the target is the protocol-normalised one — rendering a phone number
   * must never alter the number.
   */
  readonly href?: string;
}

/**
 * The canonical store facts, in approved footer/Local row order.
 *
 * Empty today, and empty is a *result*, not a stub: every value the Product
 * Owner has made canonical appears here, and there are none. When one arrives,
 * add it here and both the Local page and the footer publish it with no other
 * change.
 */
const CANONICAL_STORE_FACTS: readonly StoreFact[] = [];

/** The facts that may be published. Callers render exactly these rows. */
export function resolveStoreFacts(): readonly StoreFact[] {
  return CANONICAL_STORE_FACTS;
}

/** Whether any store fact is canonical, i.e. whether a fact list renders. */
export function hasCanonicalStoreFacts(): boolean {
  return CANONICAL_STORE_FACTS.length > 0;
}
