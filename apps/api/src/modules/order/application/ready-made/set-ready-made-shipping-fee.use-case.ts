/**
 * The Ready-Made half of the Admin shipping write: the point at which an order
 * becomes payable (`BR-027`, `BR-029`, `APP12-B03` §4).
 *
 * ```text
 * AWAITING_SHIPPING_FEE            first fee set
 *   → shipping fee stored (exact, may be 0)
 *   → payable total  = frozen subtotal + fee
 *   → FULL obligation PENDING for that exact total
 *   → reservation window reset to now() + 24h
 *   → order AWAITING_PAYMENT
 *
 * AWAITING_PAYMENT + FULL PENDING  fee correction
 *   → predecessor FULL SUPERSEDED, successor PENDING for the new total
 *   → order stays AWAITING_PAYMENT
 *   → reservation window UNCHANGED
 * ```
 *
 * ### A sibling of the custom path, not a branch inside it
 *
 * `SaveShippingDetailUseCase` is the `CUSTOM` authority and is left exactly as
 * `APP9-B04`/`B04-C1` delivered it. The two rules are not variants of one rule:
 * a custom fee change moves the **live remaining balance by the difference**
 * (`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2) and needs the customer's
 * recorded acknowledgement for an increase, while a Ready-Made fee
 * *recomposes* the whole payable total from the frozen subtotal and needs no
 * acknowledgement at all (`APP12-B03` §7). Folding both into one use case would
 * produce a method whose every step is an `if`, on top of a delivered file that
 * is already 341 lines — so the origin is dispatched *above* both
 * (`AdminShippingFeeRouter`) and each rule keeps its own file intact.
 *
 * ### No customer acknowledgement, deliberately
 *
 * `READY_MADE_INITIAL_FEE_ACKNOWLEDGEMENT = NOT_REQUIRED`, and the same for a
 * correction. `shipping_fee_acknowledgements` is never read and never written
 * here, and no `REQUEST_ACCESS` grant or step-up challenge is resolved. The
 * custom requirement exists because a fee increase there moves a balance the
 * customer already committed to at quotation time; a Ready-Made customer has
 * committed to nothing yet — the order is not payable until this transaction
 * commits, and their decision is expressed by paying or by letting the window
 * lapse.
 *
 * ### Money is recomposed, never compounded
 *
 * Every accepted fee produces `frozen subtotal + fee` from the order's own
 * `order_items`, so two corrections in a row give the second fee's total rather
 * than the first fee's total moved twice. The Catalog is never consulted: a SKU
 * repriced to 999,000 after the order was placed leaves a 250,000 order at
 * 250,000 (`BR-021`, §36).
 *
 * ### Lock order
 *
 * ```text
 * 1. orders                  loadReadyMadeForUpdate      FOR UPDATE
 * 2. shipping_details        lockShippingDetail          FOR UPDATE
 * 3. inventory_reservations  lockActiveOrderReservation  FOR UPDATE
 * 4. payment_obligations     findLive, then recalculate's own FOR UPDATE
 * ```
 *
 * `orders` first is the delivered direction (`DB8_LOCK_ORDER_MATRIX.md`) and is
 * what arbitrates this transaction against the expiry sweep, which opens with
 * the same lock: one of the two waits, then re-reads a committed world and
 * either refuses or skips. So there is no state in which the order is cancelled
 * while a live `FULL` stands, and none in which the order is payable while its
 * reservation has expired (§23). `shipping_details` second is the row the
 * custom path locks *first*, so even a routing mistake serialises rather than
 * interleaving. No SERIALIZABLE isolation and no advisory lock is introduced.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import {
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
  READY_MADE_ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  TransactionManager,
  type ObligationId,
  type OrderId,
  type OrderRepository,
  type PaymentObligation,
  type PaymentObligationRepository,
  type ReadyMadeOrderRepository,
  type Reservation,
  type ShippingDetail,
  type SkuStockRepository,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  formatPayableAmount,
  isWholeDong,
  parsePayableAmount,
  type PayableAmount,
} from '../../domain/ready-made/payable-total';
import {
  READY_MADE_PAYMENT_WINDOW_MS,
  readyMadeFeeRecalcReason,
} from '../../domain/ready-made/payment-window.policy';
import { adminShippingError } from '../../domain/shipping/admin-shipping.errors';
import { requireOrderLifecycleAdminId } from '../admin/order-lifecycle-actor';
import { ReadyMadePayableTotalResolver } from './payable-total.resolver';

/** `payment_reconciliations.action` (COL-TBL057-03) — APP9's own vocabulary. */
const OBLIGATION_RECALC = 'OBLIGATION_RECALC';

/** `BR-029` — a Ready-Made order has exactly one obligation, of this kind. */
const FULL = 'FULL';

export interface SetReadyMadeShippingFeeCommand {
  readonly orderId: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward?: string | undefined;
  readonly district?: string | undefined;
  readonly province: string;
  readonly feeAmount: string;
  readonly carrierName?: string | undefined;
  readonly trackingCode?: string | undefined;
}

/** What the fee write did to this order's money, if anything. */
export interface ReadyMadeFeeOutcome {
  readonly changed: boolean;
  /** `null` before the first confirmation — the fee was pending, not zero. */
  readonly previousFeeAmount: string | null;
  readonly supersededObligationId: string | undefined;
  readonly fullObligationId: string | undefined;
  readonly payableTotalAmount: string | undefined;
  /** Only the **first** confirmation moves it (§16). */
  readonly paymentWindowResetAt: Date | undefined;
}

export interface SetReadyMadeShippingFeeResult {
  readonly detail: ShippingDetail;
  readonly fee: ReadyMadeFeeOutcome;
}

@Injectable()
export class SetReadyMadeShippingFeeUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(READY_MADE_ORDER_REPOSITORY)
    private readonly readyMade: ReadyMadeOrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
    private readonly payableTotals: ReadyMadePayableTotalResolver,
    private readonly requestContext: RequestContextService,
  ) {}

  async save(command: SetReadyMadeShippingFeeCommand): Promise<SetReadyMadeShippingFeeResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireOrderLifecycleAdminId(this.requestContext);
    const id = command.orderId as OrderId;

    const nextFee = parsePayableAmount(command.feeAmount);
    if (nextFee === undefined || !isWholeDong(nextFee)) {
      // `BR-027`: exact, non-negative, whole đồng. The decimal pattern admits no
      // sign at all, so this refusal is the VND scale rule
      // (`ck_shipping_details__fee_currency_scale`), rejected as input rather
      // than left to surface from the driver as a constraint violation.
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }

    return this.transactions.runInTransaction(async () => {
      const order = await this.readyMade.loadReadyMadeForUpdate(id);
      if (order === undefined) {
        // Absent, or custom. The router only sends Ready-Made orders here, so
        // reaching this means the order vanished between the two reads.
        throw adminShippingError('ORDER_NOT_FOUND');
      }

      const detail = await this.orders.lockShippingDetail(id);
      if (detail === undefined) {
        // `APP12-B02` writes the detail inside the creation transaction, so an
        // order without one is a data fault. It is not created here: a fee
        // against a detail that does not exist is a fee against no destination.
        throw adminShippingError('SHIPPING_DETAIL_NOT_FOUND');
      }
      if (detail.status === 'FROZEN') {
        throw adminShippingError('SHIPPING_FROZEN');
      }

      const fee =
        order.status === 'AWAITING_SHIPPING_FEE'
          ? await this.confirmFirstFee(id, nextFee, adminId)
          : await this.correctFee(id, order.status, detail, nextFee, adminId);

      // The detail is written last, after every refusal has had its chance, so
      // a rejected fee leaves the stored one untouched. The upsert carries the
      // whole record because the operation is a `PUT` of it.
      const saved = await this.orders.saveShippingDetails({
        orderId: id,
        recipientName: command.recipientName,
        recipientPhone: command.recipientPhone,
        addressLine: command.addressLine,
        ward: command.ward,
        district: command.district,
        province: command.province,
        feeAmount: formatPayableAmount(nextFee),
        carrierName: command.carrierName,
        trackingCode: command.trackingCode,
      });

      return { detail: saved, fee };
    });
  }

  /** §13–§17 — the first confirmation, and the only one that resets the window. */
  private async confirmFirstFee(
    id: OrderId,
    fee: PayableAmount,
    adminId: string,
  ): Promise<ReadyMadeFeeOutcome> {
    const reservation = await this.requireHeldReservation(id);
    const payable = await this.payableTotals.resolve(id, fee);

    // §16, §17 — the same reservation row, repriced in time. Taken **before**
    // the obligation is created so the window move and the obligation it exists
    // for commit together; between them there is no instant at which a payable
    // order still carries its creation-time deadline.
    const rescheduled = await this.stock.rescheduleReservationExpiry({
      id: reservation.id,
      windowMs: READY_MADE_PAYMENT_WINDOW_MS,
    });

    // §13 — one live `FULL`, priced at the exact payable total, with no
    // quotation to name (`ck_payment_obligations__source_by_kind`). No
    // `DEPOSIT`, no `REMAINING`, no attempt, no QR and no evidence:
    // `APP12-B04` owns the customer's payment composition and `APP12-B05` its
    // verification.
    const created = await this.obligations.createForOrder({
      id: newId() as ObligationId,
      orderId: id,
      kind: FULL,
      amount: formatPayableAmount(payable),
      sourceQuotationVersionId: null,
    });

    // §14 — `orders.total_amount` stops being the merchandise subtotal and
    // becomes the payable total, in the same transaction as the obligation, so
    // the two figures are never observably different.
    await this.readyMade.setPayableTotal(id, formatPayableAmount(payable));

    // §15 — the delivered Ready-Made transition writer. No new state.
    await this.readyMade.transitionReadyMade({
      id,
      to: 'AWAITING_PAYMENT',
      actor: { kind: 'ADMIN', adminId },
      correlationId: newId(),
    });

    return {
      changed: true,
      previousFeeAmount: null,
      supersededObligationId: undefined,
      fullObligationId: created.id,
      payableTotalAmount: created.amount,
      paymentWindowResetAt: rescheduled.expiresAt,
    };
  }

  /**
   * §18–§22 — a correction while the order is already payable.
   *
   * The unchanged-fee replay is decided **before** the obligation's status is
   * consulted, which is what lets a non-fee edit through on an order whose
   * `FULL` is already `SATISFIED` (§22) while a real fee change on that same
   * order is refused.
   */
  private async correctFee(
    id: OrderId,
    status: string,
    detail: ShippingDetail,
    fee: PayableAmount,
    adminId: string,
  ): Promise<ReadyMadeFeeOutcome> {
    if (status !== 'AWAITING_PAYMENT') {
      // §9, §23 — every other lifecycle position, `CANCELLED` above all. An
      // expired order is not revived by pricing it.
      throw adminShippingError('ORDER_SHIPPING_FEE_NOT_SETTABLE');
    }

    const stored = detail.feeAmount;
    const storedFee = stored === undefined ? undefined : parsePayableAmount(stored);
    if (storedFee === undefined) {
      // `AWAITING_PAYMENT` is only reachable through a confirmation that stored
      // a fee, so a missing one means the two halves have already diverged.
      throw adminShippingError('ORDER_SUBTOTAL_NOT_AVAILABLE');
    }

    const live = await this.obligations.findLiveForOrder(id, FULL);
    if (live === undefined) {
      throw adminShippingError('ORDER_FULL_PAYMENT_MISSING');
    }

    if (fee === storedFee) {
      // §19 — a replay. No supersession, no reconciliation row, no window move
      // and no order move, and the live `FULL` count is unchanged. The caller
      // still gets its non-fee shipping edit, applied by the shared write.
      return unchangedFee(storedFee, live);
    }

    if (live.status !== 'PENDING') {
      // §22 — `SATISFIED` is terminal in LC-15 and `TR-LC15-04` is
      // `PENDING -> SUPERSEDED` alone. Paid money is never turned back into a
      // balance, and nothing at all is written.
      throw adminShippingError('SHIPPING_FEE_CHANGE_NOT_AVAILABLE');
    }

    // §18 — the stock must still be held for the order to remain priced. Its
    // deadline is deliberately not touched: see `payment-window.policy`.
    await this.requireHeldReservation(id);

    const payable = await this.payableTotals.resolve(id, fee);

    // §20 — the delivered supersession, the only writer that produces
    // `SUPERSEDED` and sets `superseded_by_obligation_id`. The predecessor's
    // amount is never edited in place, and the partial live-obligation unique
    // index keeps exactly one live `FULL` across the swap.
    const successor = await this.obligations.recalculate({
      id: live.id,
      successorId: newId() as ObligationId,
      amount: formatPayableAmount(payable),
    });

    await this.readyMade.setPayableTotal(id, formatPayableAmount(payable));

    // §21 — APP9's own action, because a fee-driven supersession is exactly
    // what `OBLIGATION_RECALC` already names. No new event kind is invented,
    // and no customer acknowledgement row is written.
    await this.obligations.appendReconciliation({
      paymentObligationId: successor.id,
      action: OBLIGATION_RECALC,
      reason: readyMadeFeeRecalcReason(formatPayableAmount(storedFee), formatPayableAmount(fee)),
      adminId,
      amount: successor.amount,
      resolvedStatus: successor.status,
    });

    // The order does **not** move: it was payable before this and is payable
    // after it, at a different figure.
    return {
      changed: true,
      previousFeeAmount: formatPayableAmount(storedFee),
      supersededObligationId: live.id,
      fullObligationId: successor.id,
      payableTotalAmount: successor.amount,
      paymentWindowResetAt: undefined,
    };
  }

  /** §9, §18 — the stock this order is priced against must still be committed. */
  private async requireHeldReservation(id: OrderId): Promise<Reservation> {
    const reservation = await this.stock.lockActiveOrderReservation(id);
    if (reservation === undefined) {
      // Expired, released or consumed. Nothing is re-reserved: a replacement
      // would be a silent second claim on stock another order may now hold.
      throw adminShippingError('ORDER_RESERVATION_NOT_HELD');
    }
    return reservation;
  }
}

/** §19 — the fee did not move, so no money record is touched at all. */
function unchangedFee(stored: PayableAmount, live: PaymentObligation): ReadyMadeFeeOutcome {
  return {
    changed: false,
    previousFeeAmount: formatPayableAmount(stored),
    supersededObligationId: undefined,
    fullObligationId: live.id,
    payableTotalAmount: live.amount,
    paymentWindowResetAt: undefined,
  };
}
