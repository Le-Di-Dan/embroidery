import type { AdminOrderDetailResponse } from '@embroidery/api-client';

/**
 * The Ready-Made order's frozen merchandise subtotal, as the server stored it
 * (`APP12-U01-C1` F1).
 *
 * A Ready-Made order is one SKU line (`BR-029`), and that line's
 * `lineTotalAmount` is the frozen goods figure — unit price × quantity, taken
 * at order creation and transported as stored. It is **not** `totalAmount`:
 * once an operator confirms the shipping fee the order total includes it, and
 * the U01 journey caught the card labelling a shipping-inclusive 240,000 as
 * `Tiền hàng` beside a 210,000 line.
 *
 * Nothing is computed. There is no `totalAmount − fee`, no `unitPrice ×
 * quantity` and no sum over lines: an order that does not carry exactly one
 * line is not a shape this branch can name a goods figure for, and it answers
 * `undefined` rather than inventing one.
 */
export function readyMadeMerchandiseOf(order: AdminOrderDetailResponse): string | undefined {
  const [line, ...rest] = order.items;
  return line !== undefined && rest.length === 0 ? line.lineTotalAmount : undefined;
}
