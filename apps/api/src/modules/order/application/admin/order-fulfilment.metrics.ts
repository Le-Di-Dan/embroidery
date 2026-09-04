/**
 * Telemetry for the four fulfilment transitions (`APP12-H03` §7, §15).
 *
 * One recorder for shipping-fee confirmation, shipping-fee correction, dispatch
 * and completion, because all four answer the same operator question — "is the
 * fulfilment path working, and if it is refusing, why?" — and all four share the
 * refusal-versus-failure rule that decides whether an alert fires.
 *
 * The `origin` label is on every observation. Wave 1 sells Ready-Made and Wave 2
 * will re-enable Custom on the same commands, and an operator looking at a
 * dispatch failure needs to know which lifecycle it belongs to before anything
 * else: the two have different money rules, different preconditions and
 * different remedies.
 *
 * Each observation is taken **after** the use case's transaction settles. That
 * is what makes a rolled-back dispatch impossible to read as a dispatch.
 */
import { Injectable } from '@nestjs/common';
import type { MetricFulfilmentTransition } from '@embroidery/observability';

import { ApiCommerceMetrics } from '../../../../platform/metrics/api-metrics.providers';
import {
  SUCCEEDED,
  classifyOutcome,
  type RefusalRecognizer,
} from '../../../../platform/metrics/commerce-outcome';

/** The origin before the database has named one. */
const UNKNOWN_ORIGIN = 'other';

export interface FulfilmentObservation {
  /** Called once the order's own row has named its origin. */
  origin(origin: string): void;
  succeeded(): void;
  /**
   * Records a success under a transition only the committed outcome could name.
   *
   * The shipping-fee command is one operation with two meanings — confirming a
   * first fee and correcting an existing one — and which of them ran is a fact
   * of the result, not of the request. A refusal still uses the transition the
   * observation was started with, because nothing was written and no committed
   * outcome exists to name.
   */
  succeededAs(transition: MetricFulfilmentTransition): void;
  failed(error: unknown): void;
}

@Injectable()
export class OrderFulfilmentMetrics {
  constructor(private readonly commerce: ApiCommerceMetrics) {}

  /**
   * Starts one observation.
   *
   * `recognize` is supplied by the caller because each command publishes its own
   * refusal vocabulary — `AdminShippingError` for the fee commands,
   * `OrderDeliveryError` for dispatch and completion. Passing it in keeps this
   * file from having to know, and keeps a command that grows a third vocabulary
   * from silently classifying its refusals as system errors.
   */
  start(
    transition: MetricFulfilmentTransition,
    recognize: RefusalRecognizer,
  ): FulfilmentObservation {
    const commerce = this.commerce;
    // No duration histogram. A fulfilment transition is an operator action
    // whose latency is a database round trip; the HTTP family already carries
    // that, and a second histogram per transition would multiply series for a
    // question no panel or alert in this checkpoint asks (§5).
    let origin = UNKNOWN_ORIGIN;

    return {
      origin(resolved: string): void {
        origin = resolved;
      },
      succeeded(): void {
        commerce.recordFulfilment({ transition, origin, ...SUCCEEDED });
      },
      succeededAs(settled: MetricFulfilmentTransition): void {
        commerce.recordFulfilment({ transition: settled, origin, ...SUCCEEDED });
      },
      failed(error: unknown): void {
        commerce.recordFulfilment({ transition, origin, ...classifyOutcome(error, recognize) });
      },
    };
  }
}
