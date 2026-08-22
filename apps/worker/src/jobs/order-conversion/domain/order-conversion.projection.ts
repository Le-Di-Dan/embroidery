/**
 * Turning frozen evidence into the order's lines (`APP7-W01` §6, §7, §8, §9).
 *
 * Pure. It reads two already-loaded facts — the Approval Snapshot and the exact
 * accepted quotation version — and returns the lines, or a refusal. It opens no
 * transaction, issues no query and knows no table, so what an order freezes can
 * be argued about here rather than inside a SQL file.
 *
 * ### Where every field comes from, and where it may not
 *
 * ```text
 * subject          Catalog: the one ACTIVE SKU of the snapshot's frozen variant
 *                  COP:     the snapshot's own customer_owned_product_id
 * product_name     Catalog: snapshot.product_name   (never a live products row)
 *                  COP:     customer_owned_products.name (the audit's own rule)
 * variant_label    Catalog: snapshot.variant_label  COP: NULL, never fabricated
 * size_label       NULL on both branches — see below
 * quantity         the accepted line's own quantity
 * unit / line      the accepted line's own amounts, byte for byte
 * ```
 *
 * ### `size_label` is null, and that is the frozen answer
 *
 * `APP7-R00` §10 lists `size_label` among the values "copied from the snapshot",
 * and `approval_snapshots` **has no such column** — it freezes `variant_label`
 * and nothing narrower. The only place a size lives is `product_variants`, which
 * is live Catalog state the conversion is forbidden to read for display copy. A
 * column with no frozen source stays null; inventing one from live Catalog would
 * be the exact substitution `APP7-W01` §6 prohibits.
 *
 * ### Line cardinality is derived, not assumed
 *
 * One order line per priced line of the accepted version, in that version's own
 * `position` order. The accepted version is the only thing that knows how the
 * approved work was priced, `computeDraftPricing` guarantees at least one line,
 * and `CST-064` makes their totals sum to the version's subtotal. So the count
 * comes from authority: several priced lines produce several order lines, and a
 * single priced line — the common case, where the operator prices the whole
 * garment run once — produces exactly one whose quantity is the approved
 * quantity.
 *
 * Every line names the **one** approved subject and the **one** approval
 * snapshot, because an order freezes exactly one `current_approval_snapshot_id`
 * and `ck_approval_snapshots__exactly_one_placement_branch` gives that snapshot
 * exactly one subject. No line is invented because `order_items` would permit
 * it, and no priced line is dropped because a filter looked tidy — dropping one
 * would silently remove money the customer accepted.
 *
 * ### Nothing here computes
 *
 * There is no multiplication, no rounding, no 40 %, no subtotal and no
 * remainder. `skus.price_override_amount` is never read: `APP7-W01` §9 forbids
 * it from touching accepted pricing, and the only way to guarantee that is to
 * have no path to it.
 */
// The canonical AGG-15 line shape, so what this projects is exactly what
// `OrderRepository.createFromAcceptedQuotation` freezes — no shadow type in
// between that could drift from the aggregate's own contract (`APP7-W01-C1`).
import type { OrderItem } from '@embroidery/persistence';

import { conversionRefusal, type OrderConversionRefusalError } from './order-conversion.errors';
import type {
  AcceptedQuotationVersion,
  FrozenApprovalSnapshot,
} from './repositories/conversion-authority.repository';

/** The subject the snapshot froze, once its live identity has been resolved. */
export type ConversionSubject =
  | { readonly branch: 'CATALOG'; readonly skuId: string }
  | {
      readonly branch: 'CUSTOMER_OWNED';
      readonly customerOwnedProductId: string;
      readonly name: string;
    };

export type ProjectionResult =
  | { readonly ok: true; readonly items: readonly OrderItem[] }
  | { readonly ok: false; readonly error: OrderConversionRefusalError };

export function projectOrderItems(
  snapshot: FrozenApprovalSnapshot,
  version: AcceptedQuotationVersion,
  subject: ConversionSubject,
): ProjectionResult {
  if (version.lineItems.length === 0) {
    // Unreachable through `APP6-B01`, which refuses a version with no line.
    // Named anyway: a version that priced nothing cannot become an order line,
    // and a silent zero-line order would be an order for nothing.
    return {
      ok: false,
      error: conversionRefusal(
        'ACCEPTED_QUOTATION_NOT_PRICED',
        'The accepted quotation version has no priced line to convert.',
      ),
    };
  }

  const display = displayCopy(snapshot, subject);
  const items = version.lineItems
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((line, index): OrderItem => ({
      // Dense and 1-based, which is what `uq_order_items__order_position`
      // indexes. The accepted version's own order is preserved; its numbering
      // is not copied, because a gap there is a quotation fact and would make
      // the order's lines look as if one had been removed.
      position: index + 1,
      ...display,
      quantity: line.quantity,
      unitPriceAmount: line.unitPriceAmount,
      lineTotalAmount: line.lineTotalAmount,
    }));

  return { ok: true, items };
}

/** The subject and the frozen display copy every line of this order carries. */
function displayCopy(
  snapshot: FrozenApprovalSnapshot,
  subject: ConversionSubject,
): Pick<
  OrderItem,
  'skuId' | 'customerOwnedProductId' | 'productName' | 'variantLabel' | 'sizeLabel'
> {
  if (subject.branch === 'CATALOG') {
    return {
      skuId: subject.skuId,
      customerOwnedProductId: undefined,
      productName: snapshot.productName,
      variantLabel: snapshot.variantLabel,
      sizeLabel: undefined,
    };
  }
  return {
    skuId: undefined,
    customerOwnedProductId: subject.customerOwnedProductId,
    // `APP7-R00` §10: the COP branch's product name is the customer-owned
    // product's own. No Product, SKU, Variant, Side or Area is fabricated, and
    // no placeholder Catalog row is created to host one.
    productName: subject.name,
    variantLabel: undefined,
    sizeLabel: undefined,
  };
}
