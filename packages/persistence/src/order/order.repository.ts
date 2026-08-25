/**
 * AGG-15 Order persistence contract (TBL-043..TBL-049).
 *
 * The confirmed order and everything frozen into it. Owns its items, its
 * transition history, its shipping detail and dispatch snapshot, its fee
 * acknowledgements and its cancellation requests.
 *
 * Carries **G-DB7-05** (the whole request → quotation → approval chain must
 * resolve to one root), **G-DB7-21** (GRD-009, the order creation gate),
 * **G-DB7-24** (GRD-017, shipping frozen at dispatch), **G-DB7-25**
 * (lifecycle legality) and **G-DB7-37** (GRD-016, final payment before
 * dispatch).
 *
 * Order items are immutable snapshots (INV-12) enforced by an S24 trigger, so
 * nothing here offers to edit one.
 */
import type { OrderState, ShippingDetailState } from '@embroidery/database';

import type { CustomRequestId, RequestActor } from './ordering-identity';

export type OrderId = string & { readonly __brand: 'OrderId' };

export interface Order {
  readonly id: OrderId;
  readonly code: string;
  readonly customRequestId: CustomRequestId;
  readonly customerId: string;
  readonly acceptedQuotationVersionId: string;
  readonly currentApprovalSnapshotId: string;
  readonly status: OrderState;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly deliveredAt: Date | undefined;
}

export interface OrderItem {
  readonly position: number;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

export interface ShippingDetail {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly province: string;
  readonly feeAmount: string | undefined;
  readonly carrierName: string | undefined;
  readonly trackingCode: string | undefined;
  readonly status: ShippingDetailState;
}

export interface OrderTransition {
  readonly fromStatus: OrderState;
  readonly toStatus: OrderState;
  readonly eventKind: string;
  readonly actorKind: string;
  readonly correlationId: string;
}

/**
 * Everything an order freezes at creation.
 *
 * The repository re-reads the chain itself rather than trusting these ids to
 * be consistent — that is G-DB7-05.
 */
export interface CreateOrderInput {
  readonly id: OrderId;
  readonly code: string;
  readonly customRequestId: CustomRequestId;
  readonly acceptedQuotationVersionId: string;
  readonly approvalSnapshotId: string;
  readonly items: readonly OrderItem[];
}

export interface SaveShippingDetailInput {
  readonly orderId: OrderId;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward?: string | undefined;
  readonly district?: string | undefined;
  readonly province: string;
  readonly feeAmount?: string | undefined;
  readonly carrierName?: string | undefined;
  readonly trackingCode?: string | undefined;
}

export interface TransitionOrderInput {
  readonly id: OrderId;
  readonly to: OrderState;
  readonly eventKind?: string | undefined;
  readonly actor: RequestActor;
  readonly reason?: string | undefined;
  readonly correlationId: string;
}

export interface AcknowledgeShippingFeeInput {
  readonly orderId: OrderId;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
  readonly acknowledgedAt: Date;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface OrderRepository {
  /**
   * Creates the order from an accepted quotation and an approval snapshot,
   * with its frozen items.
   *
   * Verifies the whole chain resolves to one request (G-DB7-05) and that the
   * quotation version is actually ACCEPTED (G-DB7-21 / GRD-009). The
   * `uq_orders__request` arbiter prevents a second order for the same request.
   *
   * Also appends the canonical `order.created` outbox event (SE-006,
   * DB3 side-effect catalog) in the same transaction (G-DB7-54) — the
   * notification the customer eventually gets can never observe an order
   * that the database then rolls back, or an order with no event at all.
   *
   * @requiresTransaction
   */
  createFromAcceptedQuotation(input: CreateOrderInput): Promise<Order>;

  /**
   * Loads the order under its row lock, before any decision is made about it.
   *
   * The row lock `transition` already takes, made reachable on its own so a
   * caller that must **decide** from the order's committed state — rather than
   * only move it — can hold the same lock while it decides. `APP8-B04` is the
   * first: `GRD-015`/`GRD-022` require `DEPOSIT_PAID` and refuse `ON_HOLD` /
   * `CANCELLING`, and LC-14 alone cannot express that (`ON_HOLD → IN_PRODUCTION`
   * is a *legal* move — it is the resume path — so a legality check would let a
   * held order start production). Reading the status unlocked and transitioning
   * afterwards would leave exactly the window the order row exists to close.
   *
   * It is the **first** lock in that flow's order, which is what keeps the order
   * row the arbiter between production start and an order hold or cancellation
   * (`DB8_LOCK_ORDER_MATRIX.md` §1).
   *
   * @requiresTransaction
   */
  loadForUpdate(id: OrderId): Promise<Order | undefined>;

  /** @requiresTransaction — move and evidence together, legality checked. */
  transition(input: TransitionOrderInput): Promise<Order>;

  /** @requiresTransaction — rejected once the detail is frozen. */
  saveShippingDetails(input: SaveShippingDetailInput): Promise<ShippingDetail>;

  /**
   * Freezes shipping and snapshots it, in the dispatch transaction.
   *
   * Requires the order to be READY_FOR_DELIVERY (which GRD-016 gates on the
   * remaining payment) and the shipping detail to be complete (GRD-017).
   *
   * @requiresTransaction
   */
  dispatch(orderId: OrderId, dispatchedAt: Date, correlationId: string): Promise<Order>;

  /** @requiresTransaction */
  acknowledgeShippingFee(input: AcknowledgeShippingFeeInput): Promise<void>;

  /** @requiresTransaction — one pending request per order is arbitrated physically. */
  openCancellationRequest(input: {
    id: string;
    orderId: OrderId;
    stage: string;
    initiator: string;
    reason: string;
    grantId?: string | undefined;
    stepUpChallengeId?: string | undefined;
  }): Promise<void>;

  /** @requiresTransaction */
  resolveCancellationRequest(id: string, approved: boolean, adminId: string): Promise<void>;

  findById(id: OrderId): Promise<Order | undefined>;
  findByCode(code: string): Promise<Order | undefined>;
  findByRequest(customRequestId: CustomRequestId): Promise<Order | undefined>;
  loadItems(id: OrderId): Promise<OrderItem[]>;
  loadShippingDetail(id: OrderId): Promise<ShippingDetail | undefined>;
  listTransitions(id: OrderId): Promise<OrderTransition[]>;
}
