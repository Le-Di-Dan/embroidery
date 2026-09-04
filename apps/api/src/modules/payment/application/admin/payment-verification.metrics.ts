/**
 * Telemetry for Admin payment verification (`APP12-H03` §7, §15, §22).
 *
 * §7 asks this seam for five distinguishable things: a success, an expected
 * review, an expected refusal, a stale/superseded refusal, and a system error —
 * plus the duration. Four of those five are **not** exceptions, so a classifier
 * that only looked at thrown errors would report a `REQUIRES_REVIEW` routing
 * and a lost-response replay as ordinary successes.
 *
 * ## Only a settlement is a success
 *
 * `outcome="success"` counts verifications that actually moved money state, and
 * nothing else. That is acceptance criterion §22's "payment verify replay → no
 * duplicate success": a retry of a call whose response was lost writes nothing,
 * so it must not increment the same series a second time, or the panel that
 * answers "are payments being verified" would over-report every flaky network.
 *
 * A replay and a routed review are recorded as `refused` with their own
 * `reason_class`. Neither is a failure and neither may wake anyone: the alert
 * rules fire on `system_error`, and both of these are outcomes the domain chose
 * deliberately and published in its own response.
 */
import { Injectable } from '@nestjs/common';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import {
  SUCCEEDED,
  classifyOutcome,
  startMetricTimer,
} from '../../../../platform/metrics/commerce-outcome';
import { isPaymentVerificationError } from '../../domain/verification/payment-verification.errors';
import type { PaymentDecisionView } from './admin-payment.view';

/** The obligation kind before the locked row has named one. */
const UNKNOWN_PAYMENT_KIND = 'other';

/** A committed verification that did not apply anything a second time. */
const REPLAYED = 'REPLAYED';

/** The operator's observed facts contradicted the expected ones. */
const ROUTED_TO_REVIEW = 'REQUIRES_REVIEW';

const SETTLED_ATTEMPT_STATUS = 'SUCCEEDED';

/**
 * The one obligation kind whose settlement consumes a Ready-Made reservation
 * (`APP12-B05` §5).
 *
 * `ApplyVerifiedSettlement` throws unless `commitReservedStock` returns
 * `COMMITTED`, so a committed `FULL` verification has necessarily consumed the
 * order's reservation — which makes the consume observable here, after the
 * commit, rather than inside `CommitReadyMadeStockService`, where it would be
 * recorded before the transaction that could still roll it back.
 *
 * The mirror is deliberately *not* recorded: a `FULL` refusal carries
 * `PAYMENT_ORDER_NOT_AWAITING_PAYMENT` whether the stock commit lost the race
 * or the order-state guard refused first, and attributing an ambiguous refusal
 * to the inventory panel would report a subsystem failure that may never have
 * been reached.
 */
const STOCK_COMMITTING_KIND = 'FULL';

function verificationRefusal(error: unknown): string | undefined {
  return isPaymentVerificationError(error) ? error.failure : undefined;
}

/** One verification attempt, from before the lock to after the commit. */
export interface PaymentVerificationObservation {
  /** Called once the locked obligation has named its kind. */
  paymentKind(kind: string): void;
  /** The transaction committed and returned this view. */
  settled(view: PaymentDecisionView): void;
  /** The transaction rolled back with this already-classified failure. */
  failed(error: unknown): void;
}

@Injectable()
export class PaymentVerificationMetrics {
  constructor(private readonly commerce: ApiCommerceMetrics) {}

  start(): PaymentVerificationObservation {
    const commerce = this.commerce;
    const elapsed = startMetricTimer();
    let kind = UNKNOWN_PAYMENT_KIND;
    const record = (outcome: {
      outcome: 'success' | 'refused' | 'system_error';
      reasonClass: string;
    }): void => {
      this.commerce.recordPaymentVerification({
        paymentKind: kind,
        outcome: outcome.outcome,
        reasonClass: outcome.reasonClass,
        durationSeconds: elapsed(),
      });
    };

    return {
      paymentKind(resolved: string): void {
        kind = resolved;
      },
      settled(view: PaymentDecisionView): void {
        if (view.replayed) {
          record({ outcome: 'refused', reasonClass: REPLAYED });
          return;
        }
        if (view.attemptStatus !== SETTLED_ATTEMPT_STATUS) {
          // Routed to review. A durable, correct outcome — and deliberately not
          // a `system_error`, because an operator reading a transfer wrongly is
          // exactly the case §26.26 says must never fire a failure alert.
          record({ outcome: 'refused', reasonClass: ROUTED_TO_REVIEW });
          return;
        }
        record(SUCCEEDED);
        if (kind === STOCK_COMMITTING_KIND) {
          commerce.recordReservation({ transition: 'consume', ...SUCCEEDED });
        }
      },
      failed(error: unknown): void {
        record(classifyOutcome(error, verificationRefusal));
      },
    };
  }
}
