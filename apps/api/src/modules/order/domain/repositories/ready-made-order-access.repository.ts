/**
 * The customer's own view of one Ready-Made order (`APP12-B04` §11, §12).
 *
 * A **read-only** Ordering contract beside `OrderRepository`,
 * `ReadyMadeOrderRepository` and `AdminOrderReadRepository`, on the reasoning
 * `OrderDepositContextPort` already records for the deposit surface: none of
 * the delivered reads is the right shape, and reusing one would publish fields
 * this surface must not have.
 *
 * - `ReadyMadeOrderRepository.findReadyMadeById` returns the order row and no
 *   lines, no shipping and no fee — the four things `/truy-cap/don-hang` exists
 *   to show — and it carries `customerId`, which `BR-032` keeps off the
 *   customer surface.
 * - `AdminOrderReadRepository` is an operator projection. It carries the
 *   customer id, both custom snapshot references and the internal order id, and
 *   is shaped for a queue and a workbench. A SELECT that never retrieves those
 *   columns is redaction nobody downstream can forget, which is exactly why
 *   this contract exists rather than a mapper over that one.
 *
 * ## What it deliberately cannot do
 *
 * One method, one order, no write. There is no transition, no fee setter, no
 * address setter and no cancellation: `APP12-B04` §35 keeps every shipping
 * mutation Admin-side, and a customer surface that held a writer would make
 * that a property of the code written today rather than of the wiring.
 *
 * ## Origin-scoped
 *
 * `undefined` for an order that does not exist **and** for one whose origin is
 * `CUSTOM`, exactly as `loadReadyMadeForUpdate` answers: this contract's caller
 * is only ever authorized over the Ready-Made branch, and a custom order it
 * cannot act on and an order that is not there are the same non-answer to it.
 * That is not the security boundary — the `ORDER_ACCESS` grant is — but it
 * means a routing mistake cannot render a custom order through a projection
 * built for a different lifecycle.
 */
import type { OrderState } from '@embroidery/database';

/**
 * One frozen order line, as the customer bought it (`BR-021`).
 *
 * Every field is the snapshot `APP12-B02` took at creation, never a join into
 * the live Catalog: a customer reading their order must see the product they
 * bought, under the name it had, at the price they paid, however often the
 * Catalog has been edited since. `skuId` is deliberately **absent** — it is an
 * internal identifier the customer has no operation to use it with.
 */
export interface ReadyMadeOrderLineView {
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
}

/**
 * Where the order is going, and what delivering it costs.
 *
 * The recipient facts are the customer's own, echoed back so they can check
 * what the shop will act on. `feeAmount` is `undefined` before an operator has
 * priced delivery — **not** zero: `BR-027` forbids presenting an unpriced
 * shipment as free, and the two are different answers on the customer's screen.
 *
 * `carrierName`, `trackingCode`, `fulfillmentNote` and the freeze state are not
 * here. They are operational facts APP9 records internally and shows no
 * customer, and `APP12-D01` §I confirms the Ready-Made order page renders no
 * shipping tracking.
 */
export interface ReadyMadeOrderDeliveryView {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward: string | undefined;
  readonly district: string | undefined;
  readonly province: string;
  readonly feeAmount: string | undefined;
}

/**
 * The order, projected for the customer holding its `ORDER_ACCESS` grant.
 *
 * `id` is present because the reader needs it to reach the order's live `FULL`
 * obligation, and for nothing else — the HTTP projection drops it, on the same
 * rule `PublicSecureLinkController` drops the resolved `orderId`.
 *
 * `merchandiseSubtotal` is summed from the lines rather than read from
 * `orders.total_amount`, because that column holds the merchandise subtotal
 * only until the first fee is confirmed and the **payable total** afterwards
 * (`APP12-B03` §14). Reading it would silently relabel the subtotal the moment
 * an operator priced delivery.
 */
export interface ReadyMadeOrderAccessView {
  readonly id: string;
  readonly code: string;
  readonly status: OrderState;
  readonly currencyCode: string;
  readonly merchandiseSubtotal: string;
  readonly line: ReadyMadeOrderLineView;
  readonly delivery: ReadyMadeOrderDeliveryView | undefined;
  readonly createdAt: Date;
}

export const READY_MADE_ORDER_ACCESS_REPOSITORY = Symbol('READY_MADE_ORDER_ACCESS_REPOSITORY');

export interface ReadyMadeOrderAccessRepository {
  /**
   * One Ready-Made order, by its own id, projected for its customer.
   *
   * Never throws for absence, on the same terms as
   * `OrderDepositContextPort.findOrderById`: the caller is a non-enumerating
   * public surface and must not be handed a distinguishable failure to report.
   * An order that does not exist, one of the other origin, and one whose lines
   * are unreadable all have to look the same from outside.
   */
  findForCustomer(orderId: string): Promise<ReadyMadeOrderAccessView | undefined>;
}
