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
  readonly ward: string | undefined;
  readonly district: string | undefined;
  readonly province: string;
  readonly countryCode: string;
  readonly feeAmount: string | undefined;
  readonly carrierName: string | undefined;
  readonly trackingCode: string | undefined;
  readonly status: ShippingDetailState;
  readonly frozenAt: Date | undefined;
}

/**
 * The fee facts a pre-freeze shipping write must decide against, read together
 * under the shipping detail's own row lock (`APP9-B04`).
 *
 * A fee change is only meaningful against the fee it replaces, and `DB3`
 * §1.2 names two different baselines depending on whether one has been set:
 * the stored `shipping_details.fee_amount` once the Admin has set one, and the
 * **accepted quotation version's** frozen `shipping_fee_amount` before that —
 * the figure the live `REMAINING` obligation was priced from. Reading them in
 * one locked call is what makes the baseline the transaction decides on the same
 * baseline it then writes against; two unlocked reads could each be true of a
 * different instant.
 *
 * `FOR UPDATE` is on the **shipping detail** alone, fixing the lock order as
 * `shipping_details` → `payment_obligations`. The quotation version is read
 * without a lock deliberately: an `ACCEPTED` version is frozen by INV-02, so
 * there is no writer to contend with, and locking a row nothing updates would
 * only widen the window this transaction holds.
 *
 * `detail` is `undefined` for an order that has never had one saved — the
 * ordinary case for the first Admin write, not an error.
 */
export interface ShippingFeeBaseline {
  readonly detail: ShippingDetail | undefined;
  /** The accepted quotation version's frozen shipping fee. */
  readonly quotedFeeAmount: string;
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

/**
 * One committed customer acknowledgement of one exact fee movement (TBL-049).
 *
 * Append-only evidence: there is no update and no delete on this table, and the
 * row carries references only — no raw secure-link token, no OTP, no code hash
 * and no pepper (DEV-DB6-014).
 */
export interface ShippingFeeAcknowledgement {
  /** The identity column, rendered as text; `bigint` never leaves as a number. */
  readonly id: string;
  readonly orderId: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
  readonly acknowledgedAt: Date;
}

/**
 * The exact tuple an acknowledgement must bind to be usable (`APP9-B04-C1` §9).
 *
 * All three fields together, never a "latest acknowledgement for this order":
 * a decision the customer made about one fee movement must not authorize a
 * different one.
 */
export interface FindShippingFeeAcknowledgementInput {
  readonly orderId: OrderId;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
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
   * Freezes shipping, snapshots it and moves the order to DELIVERED, in one
   * transaction — LC-14 `TR-LC14-07`.
   *
   * Requires the order to be READY_FOR_DELIVERY (which GRD-016 gates on the
   * remaining payment) and the shipping detail to be complete (GRD-017). The
   * freeze, the snapshot and the lifecycle move commit together or not at all,
   * so no committed state exists in which an order is dispatched and its
   * address is still editable, or in which a snapshot has no transition
   * explaining it.
   *
   * `actor` is the operator the `order_transitions` row is attributed to.
   * `TR-LC14-07` is an **admin** move, so the Admin command passes its bound
   * operator; it is optional only because fixtures and benchmarks that predate
   * `APP9-B05` call this writer to *manufacture* a FROZEN detail rather than to
   * perform a dispatch, and the `order.dispatch` system job key they fall back
   * to is an honest description of what they are.
   *
   * Replay is a deterministic refusal, not a second receipt: the source-state
   * assertion is against the locked `orders` row, so a retry after commit finds
   * DELIVERED and writes nothing. `uq_shipping_snapshots__order` is the
   * physical backstop behind that — one dispatch freeze per order, always.
   *
   * @requiresTransaction
   */
  dispatch(
    orderId: OrderId,
    dispatchedAt: Date,
    correlationId: string,
    actor?: RequestActor,
  ): Promise<Order>;

  /**
   * The fee baseline for one order, taken under the shipping detail's own
   * `FOR UPDATE` lock (`APP9-B04`).
   *
   * Returns nothing when the order itself does not exist. A missing shipping
   * detail is **not** absence: the baseline still resolves, carrying the
   * quoted fee and no detail.
   *
   * @requiresTransaction — a lock taken outside one is released immediately and
   * proves nothing.
   */
  lockShippingFeeBaseline(orderId: OrderId): Promise<ShippingFeeBaseline | undefined>;

  /**
   * Appends one customer acknowledgement of a shipping-fee increase.
   *
   * Written by the **customer's** own command (`APP9-B04-C1`), never by the
   * Admin shipping write: the row is the customer's decision, and a decision
   * nobody made is not evidence. Returns the committed row so the caller can
   * report exactly what was recorded rather than what it believes it sent.
   *
   * @requiresTransaction
   */
  acknowledgeShippingFee(input: AcknowledgeShippingFeeInput): Promise<ShippingFeeAcknowledgement>;

  /**
   * The standing acknowledgement for one exact fee movement, if the customer
   * has made that decision.
   *
   * Read by the Admin write before it applies an increase, and by the customer
   * command as its replay lookup. Matching is on the whole tuple — order,
   * previous fee, new fee — so an acknowledgement whose `previous_fee_amount`
   * no longer equals the current baseline simply does not match, which is what
   * makes stale evidence unusable without a mutable "consumed" flag the schema
   * does not have.
   */
  findShippingFeeAcknowledgement(
    input: FindShippingFeeAcknowledgementInput,
  ): Promise<ShippingFeeAcknowledgement | undefined>;

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
