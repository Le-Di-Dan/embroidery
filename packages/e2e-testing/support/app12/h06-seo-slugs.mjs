/**
 * The business keys and amounts of the `APP12-H06` SEO fixture.
 *
 * A module of its own so the seeder, the row writers and — through the
 * orchestrator — the acceptance spec all read one declaration. Every key carries
 * the `app12-h06-e2e` prefix, so a row that somehow outlived its disposable
 * database is recognisable as harness debris rather than as catalog an operator
 * authored, and could never be mistaken for `APP12-G03` data.
 */
/** The prefix every business key in this fixture carries. */
export const H06_FIXTURE_PREFIX = 'app12-h06-e2e';

export const H06_INDEXABLE_CATEGORY_SLUG = `${H06_FIXTURE_PREFIX}-danh-muc-mo`;
export const H06_NONINDEXABLE_CATEGORY_SLUG = `${H06_FIXTURE_PREFIX}-danh-muc-kin`;

/** Published, indexable, five variants — the `AggregateOffer` subject. */
export const H06_AGGREGATE_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-ao-thun`;
/**
 * Published, indexable, exactly one offerable SKU — the single `Offer` subject,
 * and also the Product with **no description of its own**, which is what makes
 * the "an absent description is published as absent" case observable.
 */
export const H06_SINGLE_OFFER_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-khan-don`;
/** Published and indexable with nothing sellable — a `Product` with no `offers`. */
export const H06_NO_OFFER_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-khong-ban`;
/** Published but `is_indexable = false` — noindex, and absent from the sitemap. */
export const H06_NOINDEX_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-khong-index`;
/** Published and indexable, but sitting under the non-indexable category. */
export const H06_IN_NOINDEX_CATEGORY_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-trong-danh-muc-kin`;
/** `DRAFT` — must answer 404, not 200 with a not-found body. */
export const H06_DRAFT_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-nhap`;
/** `ARCHIVED` — must answer 404. */
export const H06_ARCHIVED_PRODUCT_SLUG = `${H06_FIXTURE_PREFIX}-luu-tru`;

export const H06_GALLERY_SLUG = `${H06_FIXTURE_PREFIX}-tac-pham`;
export const H06_NOINDEX_GALLERY_SLUG = `${H06_FIXTURE_PREFIX}-tac-pham-an`;

/** A slug that is well-formed and names nothing. Needs no row. */
export const H06_UNKNOWN_SLUG = `${H06_FIXTURE_PREFIX}-khong-ton-tai`;

/** The three amounts a correct `AggregateOffer` is built from. */
export const H06_LOW_PRICE = '399000';
export const H06_MID_PRICE = '450000';
export const H06_HIGH_PRICE = '520000';
/** The ambiguous pair, priced outside the range on both sides. See the header. */
export const H06_AMBIGUOUS_LOW_PRICE = '111000';
export const H06_AMBIGUOUS_HIGH_PRICE = '900000';
/** The single-offer Product's price. */
export const H06_SINGLE_PRICE = '250000';

/** The operator-authored SEO overrides the head must publish verbatim. */
export const H06_SEO_TITLE = 'Áo thun thêu tay H06';
export const H06_SEO_DESCRIPTION = 'Mô tả SEO do người vận hành soạn cho H06.';
/** The Product body description, distinct from the SEO override above. */
export const H06_PRODUCT_DESCRIPTION = 'Mô tả sản phẩm H06, khác với mô tả SEO.';
