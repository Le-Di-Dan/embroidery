/**
 * Telemetry for the Ready-Made creation transaction (`APP12-H03` §7, §22).
 *
 * Separated from the use case rather than inlined into it, for two reasons.
 * The creation transaction is already the longest file in the module and its
 * subject is money and stock, not measurement; and the *rules* below — what
 * counts as a success, what counts as a refusal, and which of the two metric
 * families a given failure belongs to — are worth stating once, in one place a
 * reviewer can check against the alert rules.
 *
 * ## The two rules that matter
 *
 * **A success is recorded after the transaction settles, never inside it.**
 * `runInTransaction` resolves only after the commit, so a creation that rolled
 * back cannot reach the success branch. This is acceptance criterion §22's
 * "rolled-back transaction → no false success", and it is a property of where
 * the call sits rather than of anything this file checks.
 *
 * **A refusal is only a refusal when the domain says so.** `ReadyMadeOrderError`
 * publishes five codes and nothing else is one. An error nobody has classified
 * is a `system_error` and reaches the alert rule — the conservative direction,
 * because the opposite mistake is a new failure mode that silently joins the
 * "customer ordered too many units" series and is never alerted on.
 */
import { Injectable } from '@nestjs/common';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import {
  SUCCEEDED,
  classifyOutcome,
  startMetricTimer,
} from '../../../../platform/metrics/commerce-outcome';
import {
  classifyReadyMadeOrderFailure,
  isReadyMadeOrderError,
} from '../../domain/ready-made/ready-made-order.errors';

/** `orders.origin` as a label. The domain's own value, never a synonym. */
export const READY_MADE_ORIGIN = 'READY_MADE';

/** The refusal that belongs to the reservation rather than to the order. */
const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK';

/**
 * What one creation attempt produced.
 *
 * `reserved` distinguishes a fresh creation from an idempotent replay. Both
 * return an order and both are an order-creation success, but only the fresh
 * one took stock — counting a replay as a reservation would report inventory
 * movement that never happened.
 */
export interface ReadyMadeCreationAttempt<TResult> {
  readonly result: TResult;
  readonly reserved: boolean;
}

function readyMadeRefusal(error: unknown): string | undefined {
  return isReadyMadeOrderError(error) ? error.failure : undefined;
}

@Injectable()
export class ReadyMadeOrderMetrics {
  constructor(private readonly commerce: ApiCommerceMetrics) {}

  /**
   * Observes one whole creation attempt and re-throws the classified failure.
   *
   * Classification happens here rather than in the caller so the metric and the
   * customer see the same verdict: the persistence codes this command owns
   * become bounded refusals, and everything else stays itself.
   */
  async observeCreation<TResult>(
    run: () => Promise<ReadyMadeCreationAttempt<TResult>>,
  ): Promise<TResult> {
    const elapsed = startMetricTimer();
    try {
      const attempt = await run();
      this.commerce.recordOrderCreate({
        origin: READY_MADE_ORIGIN,
        ...SUCCEEDED,
        durationSeconds: elapsed(),
      });
      if (attempt.reserved) {
        this.commerce.recordReservation({ transition: 'create', ...SUCCEEDED });
      }
      return attempt.result;
    } catch (error: unknown) {
      const classified = classifyReadyMadeOrderFailure(error);
      const outcome = classifyOutcome(classified, readyMadeRefusal);
      this.commerce.recordOrderCreate({
        origin: READY_MADE_ORIGIN,
        ...outcome,
        durationSeconds: elapsed(),
      });
      if (outcome.reasonClass === INSUFFICIENT_STOCK) {
        // The one failure that is unambiguously the reservation's own. Every
        // other failure is attributed to order creation only: a system error
        // raised before the reservation step never touched inventory, and
        // recording it as a reservation failure would make the inventory panel
        // report a fault in a subsystem that was never called.
        this.commerce.recordReservation({ transition: 'create', ...outcome });
      }
      throw classified;
    }
  }
}
