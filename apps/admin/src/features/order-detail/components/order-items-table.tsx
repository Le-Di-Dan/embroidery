import type { AdminOrderItemResponse } from '@embroidery/api-client';

import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { hasAnySizeLabel, toOrderItemRow } from '../model/order-item-presentation';

interface OrderItemsTableProps {
  readonly items: readonly AdminOrderItemResponse[];
}

/**
 * The frozen order lines (`734:64`, `736:63`).
 *
 * A real `<table>` in `position` order, exactly as the server returned it: the
 * position is dense and unique within the order, and re-sorting it here would
 * disagree with the document the customer approved.
 *
 * ## The size column tells the truth about absence
 *
 * `sizeLabel` is optional in the contract and, as `734:108` records, currently
 * absent on every line including catalog ones. Where it is absent the cell shows
 * "—" with "không có" beneath it, and nothing anywhere in this feature
 * reconstructs a size from the variant label, from a SKU or from a live
 * `product_variants` row. A fabricated size on an order line is a claim about
 * what the customer agreed to buy.
 *
 * The explanatory note appears only when no line carries a size, so it explains
 * something the operator is actually looking at rather than restating a rule
 * against evidence to the contrary.
 *
 * ## The Catalog / customer-owned distinction stays truthful
 *
 * A catalog line shows its frozen SKU and variant; a customer-owned line shows
 * neither and says so. The kind badge is text, not a colour, and the subject
 * line under the product name is built from the contract's own optional fields —
 * a catalog line missing both simply shows nothing rather than borrowing the
 * customer-owned wording.
 */
export function OrderItemsTable({ items }: OrderItemsTableProps) {
  const rows = items.map(toOrderItemRow);
  const showSizeNote = !hasAnySizeLabel(items);

  return (
    <section className="order-card" aria-labelledby="order-items-heading">
      <h2 className="order-card__title" id="order-items-heading">
        {COPY.sections.items}
      </h2>
      <p className="order-card__help">{COPY.sections.itemsHelp}</p>

      <table className="order-items" data-testid="order-items-table">
        <caption className="order-items__caption">{COPY.sections.items}</caption>
        <thead>
          <tr>
            <th scope="col">{COPY.items.position}</th>
            <th scope="col">{COPY.items.product}</th>
            <th scope="col">{COPY.items.kind}</th>
            <th scope="col">{COPY.items.size}</th>
            <th scope="col" className="order-items__numeric">
              {COPY.items.quantity}
            </th>
            <th scope="col" className="order-items__numeric">
              {COPY.items.unitPrice}
            </th>
            <th scope="col" className="order-items__numeric">
              {COPY.items.lineTotal}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-testid="order-item-row"
              data-kind={row.isCatalog ? 'CATALOG' : 'CUSTOMER_OWNED'}
            >
              <td>{row.position}</td>
              <th scope="row" className="order-items__product">
                <span className="order-items__product-name">{row.productName}</span>
                {row.subjectDetail === '' ? null : (
                  <span className="order-items__product-detail">{row.subjectDetail}</span>
                )}
              </th>
              <td>
                <span className="order-items__kind">{row.kindLabel}</span>
              </td>
              <td className="order-items__size" data-testid="order-item-size">
                {row.sizeLabel === undefined ? (
                  <>
                    <span className="order-items__absent">{COPY.items.absent}</span>
                    <span className="order-items__absent-note">{COPY.items.absentNote}</span>
                  </>
                ) : (
                  row.sizeLabel
                )}
              </td>
              <td className="order-items__numeric">{row.quantity}</td>
              <td className="order-items__numeric">{row.unitPriceAmount}</td>
              <td className="order-items__numeric">{row.lineTotalAmount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showSizeNote ? (
        <p className="order-card__note" data-testid="order-items-size-note">
          {COPY.items.sizeNote}
        </p>
      ) : null}
    </section>
  );
}
