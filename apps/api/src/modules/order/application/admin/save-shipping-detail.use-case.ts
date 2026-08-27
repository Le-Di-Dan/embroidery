/**
 * The Admin pre-freeze shipping write, and the fee recalculation it composes
 * (`APP9-B04` §6, §8–§13).
 *
 * ```text
 * shipping_details EDITABLE
 *   actor:     ADMIN (ADR-DB3-004 — a customer change request is applied here)
 *   effect:    the order-owned shipping record is created or updated, and a
 *              change to the effective fee is carried into the live REMAINING
 *              obligation as a recorded recalculation
 * ```
 *
 * It does **not** dispatch, freeze, snapshot, deliver or complete. `dispatch()`
 * is never called, `shipping_snapshots` is never written, no LC-14 transition is
 * appended and the detail is still `EDITABLE` when this commits. `APP9-B05` owns
 * the freeze boundary, and it is a different authority precisely because it is
 * irreversible.
 *
 * ### The fee baseline (§7)
 *
 * ```text
 * QUOTED_FEE_SOURCE            quotation_versions.shipping_fee_amount of the
 *                              order's ACCEPTED version — frozen by INV-02
 * CURRENT_SHIPPING_FEE_SOURCE  shipping_details.fee_amount once one is stored,
 *                              the quoted fee before that
 * COMPARISON_RULE              exact bigint hundredths; never a float
 * ```
 *
 * The quoted fee is the baseline for the **first** write for a reason worth
 * stating: the live `REMAINING` was priced from a total that already includes
 * it, so an operator who creates the detail with a fee the customer never saw
 * would otherwise move real money with no recalculation and no acknowledgement.
 * After that first write the stored fee is the baseline, which is what keeps a
 * second edit from re-applying the first one's delta.
 *
 * Reading the accepted version is **not** the forbidden "reread a mutable
 * quotation as current payment truth" (§9): an `ACCEPTED` version is frozen by
 * INV-02, the payable figure stays the obligation row throughout, and the
 * quotation is consulted only for the fee this order was created against.
 *
 * ### The recalculation (§9)
 *
 * ```text
 * successor.amount = live_remaining.amount + (new_fee - previous_fee)
 * ```
 *
 * `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2 — the remaining obligation is
 * "recalculated (`obligation.recalc`, SUPERSEDED + new) **theo chênh lệch**".
 * By the difference, applied to the figure that is live. There is no
 * `total - deposit` here, no sum over frozen lines and no second pricing model:
 * the deposit is not read, not touched and not recomputed, and the old
 * obligation's `amount` is never edited in place — it keeps the figure it was
 * payable at, and `superseded_by_obligation_id` is the history.
 *
 * ### Already-satisfied REMAINING (§12)
 *
 * Refused, with nothing written. `TR-LC15-04` is `PENDING -> SUPERSEDED` alone
 * and `SATISFIED` is terminal in LC-15, so no canonical reopen path exists; the
 * only way to manufacture one would be a backward LC-14 move
 * (`READY_FOR_DELIVERY -> AWAITING_FINAL_PAYMENT`) that LC-14 does not define,
 * leaving the customer a new `PENDING` balance they could not legally pay.
 * **Non-fee** edits on such an order still succeed — the address may still be
 * corrected until dispatch freezes it.
 *
 * ### The customer's decision is required, never manufactured (`APP9-B04-C1`)
 *
 * A fee **increase** is applied only when a matching `shipping_fee_acknowledgements`
 * row already exists — same order, same `previous_fee_amount` as the baseline
 * this transaction just locked, same `new_fee_amount` as the one being saved.
 * This use case does not write that table and cannot: the row is the customer's
 * decision, recorded by their own command, and an operator who could mint it
 * would be recording a consent nobody gave. The first B04 attempt did exactly
 * that — it resolved any live grant plus any recent step-up and appended the
 * evidence itself — and `APP9-B04-C1` exists to remove it.
 *
 * ### The transaction and the lock order (§13)
 *
 * ```text
 * 1. orders                          findById — the chain the evidence must match
 * 2. shipping_details  FOR UPDATE    lockShippingFeeBaseline, with the quoted fee
 * 3. payment_obligations             findLiveForOrder, then recalculate's own
 *                     FOR UPDATE     lock on the predecessor
 * 4. shipping_fee_acknowledgements   read (increase only) — never written here
 * 5. payment_obligations             supersede + successor
 * 6. payment_reconciliations         append — TR-LC15-04's evidence
 * 7. shipping_details                save
 * ```
 *
 * One `runInTransaction` wraps all of it, so a refusal at any step leaves no
 * shipping update, no successor obligation and no reconciliation — and an
 * acknowledgement the customer made stands untouched, because this transaction
 * only ever reads that table. The arbiter is the delivered pair and nothing new: the
 * shipping detail's row lock serialises every write against an order that has
 * one, and `uq_payment_obligations__order_kind__live` serialises two concurrent
 * *first* writes that both change the fee — the second blocks on the partial
 * unique index rather than recalculating from the same previous fee. No
 * SERIALIZABLE isolation and no advisory lock is introduced.
 *
 * ### Replay (§14)
 *
 * The delivered Admin mutation conventions, and no new idempotency store. The
 * write is a `PUT` of the whole detail, so replaying it is naturally safe by
 * committed truth: the second call reads the fee the first one stored as its
 * baseline, finds the delta zero, and writes no second successor obligation —
 * and the acknowledgement it matched on the first call no longer matches the
 * new baseline, so it cannot authorize anything a second time.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import {
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type ObligationId,
  type OrderId,
  type OrderRepository,
  type PaymentObligationRepository,
  type ShippingDetail,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { adminShippingError } from '../../domain/shipping/admin-shipping.errors';
import {
  feeDelta,
  formatFeeAmount,
  isWholeDong,
  parseFeeAmount,
  successorAmount,
  type FeeAmount,
} from '../../domain/shipping/shipping-fee-amount';
import { baselineFeeOf } from '../../domain/shipping/shipping-fee-baseline';
import { requireOrderLifecycleAdminId } from './order-lifecycle-actor';

/** `payment_reconciliations.action` for a recalculation (COL-TBL057-03). */
const OBLIGATION_RECALC = 'OBLIGATION_RECALC';

export interface SaveShippingDetailCommand {
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

/** What the fee change did, if anything. Reported so the operator sees it. */
export interface ShippingFeeOutcome {
  readonly changed: boolean;
  readonly previousFeeAmount: string;
  readonly acknowledged: boolean;
  readonly supersededObligationId: string | undefined;
  readonly remainingObligationId: string | undefined;
  readonly remainingAmount: string | undefined;
}

export interface SaveShippingDetailResult {
  readonly detail: ShippingDetail;
  readonly fee: ShippingFeeOutcome;
}

@Injectable()
export class SaveShippingDetailUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async save(command: SaveShippingDetailCommand): Promise<SaveShippingDetailResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireOrderLifecycleAdminId(this.requestContext);
    const id = command.orderId as OrderId;

    const nextFee = parseFeeAmount(command.feeAmount);
    if (nextFee === undefined || !isWholeDong(nextFee)) {
      // The DTO already refuses a malformed decimal; this is the VND scale rule
      // (`ck_shipping_details__fee_currency_scale`), refused as input rather
      // than left to surface as a constraint violation.
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }

    return this.transactions.runInTransaction(async () => {
      const order = await this.orders.findById(id);
      if (order === undefined) {
        throw adminShippingError('ORDER_NOT_FOUND');
      }

      const baseline = await this.orders.lockShippingFeeBaseline(id);
      if (baseline === undefined) {
        throw adminShippingError('ORDER_NOT_FOUND');
      }
      if (baseline.detail?.status === 'FROZEN') {
        // Asserted here as well as inside `saveShippingDetails`: this refusal
        // must happen before any obligation is superseded, not after.
        throw adminShippingError('SHIPPING_FROZEN');
      }

      const previousFee = this.baselineFee(baseline.detail, baseline.quotedFeeAmount);
      const delta = feeDelta(previousFee, nextFee);

      const fee =
        delta === 0n
          ? unchanged(previousFee)
          : await this.applyFeeChange(order, previousFee, delta, adminId);

      const detail = await this.orders.saveShippingDetails({
        orderId: id,
        recipientName: command.recipientName,
        recipientPhone: command.recipientPhone,
        addressLine: command.addressLine,
        ward: command.ward,
        district: command.district,
        province: command.province,
        feeAmount: formatFeeAmount(nextFee),
        carrierName: command.carrierName,
        trackingCode: command.trackingCode,
      });

      return { detail, fee };
    });
  }

  /**
   * The fee this write is measured against.
   *
   * Delegated to the shared rule rather than restated, because the customer's
   * acknowledgement command binds its `previousFeeAmount` with the same
   * function. Two implementations that drifted by a formatting rule would make a
   * valid customer decision silently fail to match the increase it was made for.
   */
  private baselineFee(detail: ShippingDetail | undefined, quoted: string): FeeAmount {
    const baseline = baselineFeeOf({ storedFeeAmount: detail?.feeAmount, quotedFeeAmount: quoted });
    if (baseline === undefined) {
      // Unreachable through delivered paths — the column is `numeric(14,2)` NOT
      // NULL — but a malformed baseline must refuse rather than be defaulted to
      // zero, which would turn every first write into a full-fee increase.
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }
    return baseline;
  }

  /** §9–§12 — the canonical recorded recalculation, and nothing else. */
  private async applyFeeChange(
    order: { readonly id: OrderId },
    previous: FeeAmount,
    delta: bigint,
    adminId: string,
  ): Promise<ShippingFeeOutcome> {
    const live = await this.obligations.findLiveForOrder(order.id, 'REMAINING');
    if (live === undefined) {
      throw adminShippingError('ORDER_REMAINING_PAYMENT_MISSING');
    }
    if (live.status !== 'PENDING') {
      throw adminShippingError('SHIPPING_FEE_CHANGE_NOT_AVAILABLE');
    }

    const liveAmount = parseFeeAmount(live.amount);
    if (liveAmount === undefined) {
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }
    const successor = successorAmount(liveAmount, delta);
    if (successor === undefined || !isWholeDong(successor)) {
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }

    const newFee = (previous + delta) as FeeAmount;
    const acknowledged = delta > 0n;
    if (acknowledged) {
      // §9 — an increase may only be applied when the customer has **already**
      // decided to accept this exact movement. Nothing is created here: this is
      // a read of `shipping_fee_acknowledgements`, and if the customer never
      // made the decision there is nothing to find and the write is refused.
      //
      // §17's three stale cases all fail on the same tuple match, with no
      // "consumed" flag the schema does not have. A decision to go 100k -> 120k
      // does not match a request for 100k -> 130k; once the fee has moved to
      // 110k that same decision no longer matches its `previous_fee_amount`
      // either; and the lookup is scoped by order id, so another order's
      // evidence is not reachable at all. After this write commits the baseline
      // *is* `newFee`, so the acknowledgement just used can never authorize a
      // second change.
      const standing = await this.orders.findShippingFeeAcknowledgement({
        orderId: order.id,
        previousFeeAmount: formatFeeAmount(previous),
        newFeeAmount: formatFeeAmount(newFee),
      });
      if (standing === undefined) {
        throw adminShippingError('SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED');
      }
    }
    // §11: a decrease is in the customer's favour and DB3 §1.2 requires no
    // acknowledgement for one, so none is demanded and none is fabricated for
    // symmetry.

    const created = await this.obligations.recalculate({
      id: live.id,
      successorId: newId() as ObligationId,
      amount: formatFeeAmount(successor),
    });

    // TR-LC15-04's own side effect: "reconciliation record". The action is the
    // one COL-TBL057-03 already names for this — no vocabulary is added.
    await this.obligations.appendReconciliation({
      paymentObligationId: created.id,
      action: OBLIGATION_RECALC,
      reason:
        `Shipping fee changed from ${formatFeeAmount(previous)} to ` +
        `${formatFeeAmount(newFee)} before dispatch.`,
      adminId,
      amount: created.amount,
      resolvedStatus: created.status,
    });

    return {
      changed: true,
      previousFeeAmount: formatFeeAmount(previous),
      acknowledged,
      supersededObligationId: live.id,
      remainingObligationId: created.id,
      remainingAmount: created.amount,
    };
  }
}

/** §8 — the fee did not move, so no money record is touched at all. */
function unchanged(previous: FeeAmount): ShippingFeeOutcome {
  return {
    changed: false,
    previousFeeAmount: formatFeeAmount(previous),
    acknowledged: false,
    supersededObligationId: undefined,
    remainingObligationId: undefined,
    remainingAmount: undefined,
  };
}
