/**
 * The third production job handler (`APP4-W01`).
 *
 * Thin, exactly as the two Asset handlers are. It reuses the **same** runtime —
 * same registry, same claim through `WorkerJobQueueRepository`, same lease, same
 * `background_job_attempts` ledger, same `DISPATCHED`/`DEAD_LETTER` completion.
 * APP4 adds no queue, no poller, no scheduler and no sweep
 * (`ADR-APP4-001` §13).
 *
 * Two things distinguish it from its predecessors, and both are declarations
 * rather than behaviour:
 *
 * - it reads the **aggregate linkage** out of the execution context, because the
 *   current notification intent is named there and nowhere else a consumer may
 *   look (§7);
 * - it publishes a `retryPlan`, because `notification.delivery` locks a
 *   `[60, 300]`-second schedule that the global bounded-exponential curve cannot
 *   express. The plan supplies two numbers to the runtime; the runtime still
 *   owns the completion.
 *
 * The plan is read from the policy service **per completion**, so a worker that
 * started before the policy was published uses the global schedule for its
 * fail-closed retry instead of an invented one — there is no constant in this
 * file to fall back to.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';
import type { DeliveryEnvelope } from '@embroidery/notification-delivery';

import type {
  JobClaimGate,
  JobExecutionContext,
  JobHandler,
  JobRetryPlan,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import { WorkerJobError } from '../../runtime/errors/worker-job-error';
import { NotificationDeliveryUseCase } from './application/notification-delivery.usecase';
import { NotificationDeliveryError } from './domain/delivery-failure';
import {
  NOTIFICATION_DELIVERY_EVENT_TYPE,
  NOTIFICATION_DELIVERY_PAYLOAD_VERSION,
  NOTIFICATION_INTENT_AGGREGATE_KIND,
  deriveNotificationDeliveryEffectKey,
  parseNotificationDeliveryPayload,
} from './domain/notification-delivery.payload';
import {
  NOTIFICATION_DELIVERY_POLICY_KEY,
  retryDelayMsFor,
} from './domain/notification-delivery-policy';
import { NotificationDeliveryPolicyService } from './infrastructure/policy/notification-delivery-policy.service';

/** The DB7 job kind this capability files its generic evidence under. */
const NOTIFICATION_DELIVERY: BackgroundJobKind = 'NOTIFICATION_DELIVERY';

@Injectable()
export class NotificationDeliveryHandler implements JobHandler<DeliveryEnvelope> {
  readonly eventType = NOTIFICATION_DELIVERY_EVENT_TYPE;
  readonly jobKind = NOTIFICATION_DELIVERY;
  readonly payloadSchemaVersion = NOTIFICATION_DELIVERY_PAYLOAD_VERSION;

  constructor(
    private readonly useCase: NotificationDeliveryUseCase,
    private readonly policies: NotificationDeliveryPolicyService,
  ) {}

  /**
   * `APP12-H04-C1` §3 — this capability is not claimable without its policy.
   *
   * `notification.delivery` is published by the `staff-bootstrap` Job while this
   * worker is already running, so losing that race is ordinary rather than
   * exceptional. Running anyway is what made it catastrophic: the attempt failed
   * closed (correctly), but it *spent* an attempt, and three of those inside four
   * seconds dead-lettered the customer's `VERIFICATION_CODE` and `ORDER_ACCESS`
   * credentials permanently.
   *
   * Gating the claim instead leaves the row `PENDING` with `attempt_count` at
   * zero until a policy exists. Nothing is delivered without a published budget,
   * which is the same fail-closed guarantee as before — it simply no longer
   * costs the notification its life.
   */
  get claimGate(): JobClaimGate {
    return {
      requirement: NOTIFICATION_DELIVERY_POLICY_KEY,
      ready: () => this.policies.current() !== undefined,
      refresh: () => this.policies.reloadWhileUnconfigured(),
    };
  }

  get retryPlan(): JobRetryPlan | undefined {
    const policy = this.policies.current();
    return policy === undefined
      ? undefined
      : {
          maxAttempts: policy.maxAttempts,
          retryDelayMs: (attemptNo: number): number => retryDelayMsFor(policy, attemptNo),
        };
  }

  validatePayload(payload: unknown): PayloadValidationResult<DeliveryEnvelope> {
    return parseNotificationDeliveryPayload(payload);
  }

  deriveEffectKey(_payload: DeliveryEnvelope, outboxEventId: bigint): string {
    return deriveNotificationDeliveryEffectKey(outboxEventId);
  }

  async execute(payload: DeliveryEnvelope, context: JobExecutionContext): Promise<void> {
    if (context.aggregateKind !== NOTIFICATION_INTENT_AGGREGATE_KIND) {
      // The claim filter is by event type, so a row of the right type with the
      // wrong linkage is possible and is a producer defect. Terminal: no number
      // of retries will change what the column says.
      throw new WorkerJobError(
        'JOB_INVARIANT_VIOLATION',
        `A delivery event must be linked to ${NOTIFICATION_INTENT_AGGREGATE_KIND}.`,
      );
    }

    try {
      await this.useCase.deliver({
        // The current intent. Never `originNotificationIntentId`, which is
        // lineage and stops matching at the first replay (§6.5).
        intentId: context.aggregateId,
        envelope: payload,
        attemptNo: context.attemptNo,
      });
    } catch (error: unknown) {
      // A delivery failure is already classified and already recorded; anything
      // else is unclassified and stays that way rather than being guessed at
      // from a message.
      if (error instanceof NotificationDeliveryError) {
        throw error;
      }
      throw new WorkerJobError('JOB_UNKNOWN_FAILURE', 'Notification delivery failed.', {
        cause: error,
      });
    }
  }
}
