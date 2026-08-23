/**
 * The frozen order-line view model (`734:3`, `736:3`).
 *
 * ## Nothing here is re-derived, and nothing absent is invented
 *
 * `APP7-B02` transports each line exactly as the order froze it: the product
 * name as stored, the variant and size labels as stored, the quantity, the unit
 * price and the line total. A renamed product, a retired variant or a repriced
 * SKU changes none of them, and this module reads no Catalog to find out — the
 * order-detail capability imports no Catalog operation at all, so it could not
 * enrich a historical line even by mistake.
 *
 * `sizeLabel` and `variantLabel` are **optional in the contract**. When the
 * order froze none, the cell says so (`— / không có`, exactly as `734:106`
 * requires) rather than reconstructing a label from the variant, from a SKU or
 * from a live `product_variants` row. A fabricated size on an order line is a
 * claim about what the customer approved.
 *
 * ## The subject branch is the contract's, not a guess
 *
 * `subjectKind` is `CATALOG` or `CUSTOMER_OWNED`, never both and never neither,
 * and it decides which identifiers exist: a catalog line has a `skuId`, a
 * customer-owned line has a `customerOwnedProductId` and no SKU at all. The
 * distinction stays truthful in the rendered row — a customer-owned line is
 * labelled as one and is never shown a SKU column value.
 *
 * ## Money is transported, never computed
 *
 * `unitPriceAmount` and `lineTotalAmount` are grouped for reading and nothing
 * else. There is no `unitPrice × quantity` anywhere: `APP7-B02` states the line
 * total is the accepted one, never recomputed, and a screen that multiplied
 * would eventually disagree with the order it is displaying.
 */
import type { AdminOrderItemResponse } from '@embroidery/api-client';

import { formatGroupedAmount } from '../../../shared/presentation/exact-amount';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { ORDER_DETAIL_COPY as COPY } from './order-detail-copy';

const CATALOG = 'CATALOG';

export interface OrderItemRow {
  readonly key: string;
  readonly position: number;
  readonly productName: string;
  /** The frozen subject line beneath the name: a SKU + variant, or the COP note. */
  readonly subjectDetail: string;
  readonly kindLabel: string;
  readonly isCatalog: boolean;
  /** The frozen size label, or `undefined` when the order froze none. */
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

function catalogSubjectDetail(item: AdminOrderItemResponse): string {
  const parts: string[] = [];
  if (item.skuId !== undefined) {
    parts.push(`${COPY.items.skuPrefix} ${truncateIdentifier(item.skuId)}`);
  }
  if (item.variantLabel !== undefined) {
    parts.push(`${COPY.items.variantPrefix} ${item.variantLabel}`);
  }
  // A catalog line whose stored identifiers are both absent says nothing rather
  // than borrowing the customer-owned note, which would misdescribe the branch.
  return parts.join(' · ');
}

export function toOrderItemRow(item: AdminOrderItemResponse): OrderItemRow {
  const isCatalog = item.subjectKind === CATALOG;
  return {
    key: `${String(item.position)}-${item.approvalSnapshotId}`,
    position: item.position,
    productName: item.productName,
    subjectDetail: isCatalog ? catalogSubjectDetail(item) : COPY.items.customerOwnedNote,
    kindLabel: isCatalog ? COPY.items.catalog : COPY.items.customerOwned,
    isCatalog,
    sizeLabel: item.sizeLabel,
    quantity: item.quantity,
    unitPriceAmount: formatGroupedAmount(item.unitPriceAmount),
    lineTotalAmount: formatGroupedAmount(item.lineTotalAmount),
  };
}

/**
 * Whether any line on this order actually froze a size label.
 *
 * Decides whether the explanatory note under the table is shown. It is a
 * question about the data the server sent, never a reason to fill the column in.
 */
export function hasAnySizeLabel(items: readonly AdminOrderItemResponse[]): boolean {
  return items.some((item) => item.sizeLabel !== undefined);
}
