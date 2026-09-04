/**
 * Routes one Admin shipping write to the authority that owns the order's origin
 * (`APP12-B03` §30).
 *
 * ```text
 * orders.origin = CUSTOM      → SaveShippingDetailUseCase       (APP9-B04, unchanged)
 * orders.origin = READY_MADE  → SetReadyMadeShippingFeeUseCase  (APP12-B03)
 * ```
 *
 * ### The origin is read from the database, never from the request
 *
 * `OrderOriginPort` and nothing else. The client does not send an origin, does
 * not choose a payment kind and does not select a recalculation policy — and it
 * could not, because none of those appear in `SaveShippingDetailBody`. This is
 * the point of the whole design: which money rule applies to an order is a
 * property of the order, fixed at creation by `tg_orders__origin_immutable`,
 * and an operator who could nominate it could apply the acknowledgement-free
 * Ready-Made rule to a custom order and move a real balance with no customer
 * decision behind it.
 *
 * The read needs no lock for the same reason `DrizzleOrderOriginAdapter` takes
 * none: the trigger rejects every `UPDATE` of `orders.origin`, so there is no
 * writer to race. The chosen use case then opens its own transaction and
 * re-reads the order under a row lock, so the routing decision is never the
 * thing a write depends on.
 *
 * ### Why route by origin rather than by status
 *
 * The two lifecycles overlap. `AWAITING_PAYMENT` is a Ready-Made state and
 * `ck_orders__origin_status_allowed` keeps it that way, but a status-based
 * guess would still be a rule that has to be re-derived every time either
 * lifecycle grows a state — and it would guess wrong in exactly the situation
 * that matters least visibly and costs most: an unfamiliar status combination
 * silently taking the other origin's money path.
 *
 * ### It is a router, not a second use case
 *
 * It holds no transaction, no repository writer and no money rule. Both
 * branches keep their own file, their own lock order and their own tests; this
 * one decides which is asked, and normalises the two outcomes onto one
 * response shape so the controller has no origin branch of its own.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ORDER_ORIGIN_PORT, type OrderOriginPort } from '@embroidery/persistence';
import type { ShippingDetail } from '@embroidery/persistence';

import {
  adminShippingError,
  isAdminShippingError,
} from '../../domain/shipping/admin-shipping.errors';
import { SetReadyMadeShippingFeeUseCase } from '../ready-made/set-ready-made-shipping-fee.use-case';
import { OrderFulfilmentMetrics } from './order-fulfilment.metrics';
import {
  SaveShippingDetailUseCase,
  type SaveShippingDetailCommand,
} from './save-shipping-detail.use-case';

/**
 * The union of what the two paths report, normalised.
 *
 * Both origins fill `changed`, `previousFeeAmount` and `supersededObligationId`,
 * because a supersession chain means the same thing on both. The rest is
 * origin-specific and absent rather than faked:
 *
 * ```text
 * CUSTOM      remainingObligationId / remainingAmount   — the live REMAINING
 * READY_MADE  fullObligationId / payableTotalAmount     — the live FULL
 * ```
 *
 * The two are deliberately **not** collapsed into one `obligationId` field.
 * They are different obligation kinds under different rules, and a single
 * field would let a consumer read "the obligation" without knowing whether it
 * is a balance moved by a difference or a total recomposed from a subtotal.
 * `acknowledged` stays custom-only for the same reason: Ready-Made has no
 * acknowledgement, and reporting `false` would suggest one was looked for.
 */
export interface AdminShippingSaveOutcome {
  readonly detail: ShippingDetail;
  readonly changed: boolean;
  readonly previousFeeAmount: string | null;
  readonly acknowledged: boolean | undefined;
  readonly supersededObligationId: string | undefined;
  readonly remainingObligationId: string | undefined;
  readonly remainingAmount: string | undefined;
  readonly fullObligationId: string | undefined;
  readonly payableTotalAmount: string | undefined;
}

@Injectable()
export class AdminShippingFeeRouter {
  constructor(
    @Inject(ORDER_ORIGIN_PORT) private readonly origins: OrderOriginPort,
    private readonly custom: SaveShippingDetailUseCase,
    private readonly readyMade: SetReadyMadeShippingFeeUseCase,
    private readonly metrics: OrderFulfilmentMetrics,
  ) {}

  /**
   * `APP12-H03` §7 — the fee write is instrumented here rather than in either
   * use case, because this is the only place that knows the order's origin
   * *before* the write and sees both branches settle. The origin comes from the
   * same database read the routing decision uses, so the label can never
   * disagree with the path that ran.
   */
  async save(command: SaveShippingDetailCommand): Promise<AdminShippingSaveOutcome> {
    const origin = await this.origins.originOf(command.orderId);
    if (origin === undefined) {
      throw adminShippingError('ORDER_NOT_FOUND');
    }
    return this.observed(origin, () => this.route(origin, command));
  }

  /**
   * Records the settled outcome under the transition the result reveals.
   *
   * The set/correct distinction is `previousFeeAmount`: a first confirmation
   * has no previous fee, a correction does. It is read from the committed
   * outcome rather than guessed from the order's status beforehand, so a
   * concurrent write cannot make the label describe the wrong operation.
   *
   * A refusal is attributed to `shipping_fee_set`. Nothing was written, so no
   * committed outcome exists to say which of the two it would have been, and
   * inventing one would put a refusal on a transition that never happened.
   */
  private async observed(
    origin: string,
    run: () => Promise<AdminShippingSaveOutcome>,
  ): Promise<AdminShippingSaveOutcome> {
    const refusal = (error: unknown): string | undefined =>
      isAdminShippingError(error) ? error.failure : undefined;
    const observation = this.metrics.start('shipping_fee_set', refusal);
    observation.origin(origin);
    try {
      const outcome = await run();
      observation.succeededAs(
        outcome.previousFeeAmount === null ? 'shipping_fee_set' : 'shipping_fee_corrected',
      );
      return outcome;
    } catch (error: unknown) {
      observation.failed(error);
      throw error;
    }
  }

  private async route(
    origin: string,
    command: SaveShippingDetailCommand,
  ): Promise<AdminShippingSaveOutcome> {
    if (origin === 'READY_MADE') {
      const result = await this.readyMade.save(command);
      return {
        detail: result.detail,
        changed: result.fee.changed,
        previousFeeAmount: result.fee.previousFeeAmount,
        acknowledged: undefined,
        supersededObligationId: result.fee.supersededObligationId,
        remainingObligationId: undefined,
        remainingAmount: undefined,
        fullObligationId: result.fee.fullObligationId,
        payableTotalAmount: result.fee.payableTotalAmount,
      };
    }

    // `CUSTOM` — the `APP9-B04` path, called exactly as it was before this
    // router existed and reporting exactly what it always reported.
    const result = await this.custom.save(command);
    return {
      detail: result.detail,
      changed: result.fee.changed,
      previousFeeAmount: result.fee.previousFeeAmount,
      acknowledged: result.fee.acknowledged,
      supersededObligationId: result.fee.supersededObligationId,
      remainingObligationId: result.fee.remainingObligationId,
      remainingAmount: result.fee.remainingAmount,
      fullObligationId: undefined,
      payableTotalAmount: undefined,
    };
  }
}
