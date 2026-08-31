/**
 * The closed APP11 policy set (`APP11-S05`).
 *
 * ## Exactly four, because exactly four are required
 *
 * `docs/01-PRODUCT-REQUIREMENTS.md` §2.1 lists the required Storefront policy
 * pages and lists four of them:
 *
 * ```text
 * Chính sách giao hàng   -> giao-hang   (shipping)
 * Chính sách thanh toán  -> thanh-toan  (payment)
 * Chính sách đổi trả     -> doi-tra     (returns)
 * Chính sách bảo mật     -> bao-mat     (privacy)
 * ```
 *
 * `terms`, `warranty`, `cookies`, `refund`, `legal` and `community` are **not**
 * added. Each of them is a document with legal consequences that no approved
 * repository document requires or specifies, and a policy page invented by an
 * implementation checkpoint would become the store's published position on a
 * subject nobody decided. A fifth policy is a Product Owner decision that
 * arrives with its content, not a fifth entry in this object.
 *
 * ## Why the ids and the slugs are both written here
 *
 * The id is what code refers to; the slug is what the URL says. Keeping the map
 * in one object means a policy cannot exist in the resolver under one spelling
 * and in the footer under another, and the sitemap's four concrete policy URLs
 * are generated from the same source that the router matches against.
 */

/** The four canonical policy ids, mapped to their locked URL slugs. */
export const POLICY_SLUG = {
  shipping: 'giao-hang',
  payment: 'thanh-toan',
  returns: 'doi-tra',
  privacy: 'bao-mat',
} as const;

/** A canonical policy id. */
export type PolicyId = keyof typeof POLICY_SLUG;

/** A canonical policy slug — the four values above and nothing else. */
export type PolicySlug = (typeof POLICY_SLUG)[PolicyId];

/**
 * The four ids in approved footer and sitemap order: giao-hang, thanh-toan,
 * doi-tra, bao-mat. Ordering is a decision recorded once here rather than
 * re-made by whichever surface iterates the set.
 */
export const POLICY_IDS: readonly PolicyId[] = ['shipping', 'payment', 'returns', 'privacy'];
