/**
 * The `APP12-G03` persistent UAT catalog, declared as data.
 *
 * This file holds no logic and makes no decision. It is the *intent* — what the
 * Wave-1 UAT world is supposed to contain — kept apart from `seed-app12-g03.mjs`,
 * which is the machinery that reconciles the live world against it. Two reasons
 * that separation earns its file: the seeder can then be read as a sequence of
 * delivered operations without a hundred lines of Vietnamese product copy in the
 * way, and the manifest (§16) can be diffed against this declaration to see
 * whether the persisted truth still matches what was intended.
 *
 * ## Provenance (§4)
 *
 * One convention, applied deterministically:
 *
 * ```text
 * category slug   uat-<family>
 * product slug    uat-<name>
 * SKU code        UAT-G03-<PRODUCT>-<VARIANT>
 * human names     ordinary Vietnamese, no marker at all
 * ```
 *
 * The product slug needs a note, because the API does not accept one. `products.
 * slug` is **server-derived from the name** and a rename never changes it
 * (`APP2-B02-G01` / IMP-D032 §4.2) — deliberately, since the slug is a public
 * address. So each Product is created under `creationName` (the Vietnamese name
 * with a leading `UAT`), which derives the marked slug, and is then renamed to
 * `name` through the ordinary `adminProduct_update`. The address keeps the
 * marker; the shopper sees clean copy. Both steps are delivered operations —
 * nothing here writes a slug.
 *
 * ## Why the coverage is shaped this way
 *
 * Every §23 acceptance number is carried by a *named* row rather than by a
 * count, so a change that silently drops one shows up as a missing key instead
 * of a total that still adds up:
 *
 * ```text
 * §23.14  exactly 1 image        goi-tua-theu-hoa-sen
 * §23.15  approximately 8        tui-tote-theu-chi-vang        (8)
 * §23.16  the 20 cap             tui-vai-theu-hoa-cuc          (20)
 * §23.20  multiple variants      tui-vai-theu-hoa-cuc (3), non-luoi-trai (4)
 * §23.21  multiple SKUs          the same two, plus goi-tua-hac, khan-choang
 * §23.22  base-price path        every SKU with priceOverrideAmount undefined
 * §23.23  override path          4 SKUs across 4 Products
 * §23.24  in stock               many
 * §23.25  low stock              tui-hoa-cuc/xanh-reu, goi-hac/50
 * §23.26  out of stock           tui-hoa-cuc/nau, non/be-s, mu-noi, khan/do-do
 * §23.27  mixed within a Product tui-vai-theu-hoa-cuc, non-luoi-trai, khan-choang
 * ```
 *
 * Prices are plausible Vietnamese retail figures, and every override is far
 * enough from its base (§10) that a UAT operator can tell which path is active
 * by looking at the page rather than by querying the database.
 *
 * The seven Products themselves live in `seed-app12-g03-products.mjs` and are
 * re-exported here, so this module stays the single import for everything that
 * describes the dataset while a Product's own bulk — description, price,
 * variants, SKUs, overrides, stock — does not crowd out the categories and the
 * conventions they are read against.
 */
import { G03_PRODUCTS } from './seed-app12-g03-products.mjs';

export { G03_PRODUCTS };

/** The marker every G03-owned business key carries. */
export const G03_SLUG_PREFIX = 'uat-';

/** The marker every G03-owned SKU code carries. */
export const G03_SKU_PREFIX = 'UAT-G03-';

/**
 * The reason recorded on every stock adjustment.
 *
 * `adminSkuStock_adjust` requires one (GRD-023) and it lands in the audited
 * ledger, so it is written to be legible to whoever meets it later: it names the
 * checkpoint and says the quantity is not a count of anything real.
 */
export const G03_STOCK_REASON =
  'APP12-G03 — thiết lập tồn kho ban đầu cho dữ liệu UAT (không phải tồn kho thực tế).';

/**
 * Four dynamic categories, none of them a second identity for one of the five
 * that already exist (§5: no duplicate semantic identity, and the historical
 * seed categories are not touched).
 *
 * `phu-kien` is published but **not indexable**: indexability is operator
 * controlled, and a UAT world in which every category answers the same way
 * cannot show that the control works. The other three are indexable, which is
 * §5's floor of two.
 */
export const G03_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'tui-vai',
    slug: 'uat-tui-vai-theu',
    name: 'Túi vải thêu',
    displayOrder: 210,
    isIndexable: true,
  }),
  Object.freeze({
    key: 'goi-tua',
    slug: 'uat-goi-tua-theu',
    name: 'Gối tựa thêu',
    displayOrder: 220,
    isIndexable: true,
  }),
  Object.freeze({
    key: 'non-mu',
    slug: 'uat-non-mu-theu',
    name: 'Nón mũ thêu',
    displayOrder: 230,
    isIndexable: true,
  }),
  Object.freeze({
    key: 'phu-kien',
    slug: 'uat-phu-kien-theu',
    name: 'Phụ kiện thêu',
    displayOrder: 240,
    isIndexable: false,
  }),
]);

/**
 * The Product whose gallery the operator re-curates by hand in the real Admin
 * (§7), and the move they make.
 *
 * The eight-image Product rather than the twenty: the reorder has to be
 * *verifiable by eye* in the completion evidence, and a change of primary among
 * twenty tiles is a needle in a contact sheet. `promotePosition` is the tile
 * that becomes primary; `swapPositions` is the pair of non-primary tiles that
 * exchange places, which is what proves the write carries the whole order and
 * not merely a primary flag.
 */
export const G03_CURATION = Object.freeze({
  productKey: 'tui-tote',
  promotePosition: 4,
  swapPositions: Object.freeze([2, 6]),
});

/** Every generated source image this dataset needs. */
export function totalMediaCount() {
  return G03_PRODUCTS.reduce((total, product) => total + product.mediaCount, 0);
}

/** Looks a Product up by its dataset key. Throws rather than returning undefined. */
export function productByKey(key) {
  const found = G03_PRODUCTS.find((product) => product.key === key);
  if (found === undefined) {
    throw new Error(`APP12-G03 dataset has no product keyed "${key}".`);
  }
  return found;
}
