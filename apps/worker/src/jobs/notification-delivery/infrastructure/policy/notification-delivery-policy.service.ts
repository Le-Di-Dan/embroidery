/**
 * Reads the `notification.delivery` policy from its canonical source
 * (`APP4-B01-C1` published it; `APP4-W01` only consumes it).
 *
 * Same path and same shape as `WorkerPolicyService`:
 * `PolicyConfigurationRepository.currentValue`, no environment variable and no
 * default. This class has no publish method and no Admin identity, and it must
 * not acquire either — publication is closed, and a consumer that can write its
 * own policy is not consuming one.
 *
 * Loaded at bootstrap and re-read **only while there is no usable policy**
 * (`APP12-H04` §F). Hot reload of a *valid* policy stays out of scope for the
 * `APP12-H03-C1` reason: changing a live budget under in-flight deliveries would
 * measure attempts against a policy that no longer exists. The unconfigured case
 * has no such hazard — nothing has been sent — and leaving it out is what made a
 * correct deployment lose every notification it produced:
 *
 * The policy is published by the `staff-bootstrap` Job and the worker is a
 * Deployment; Kubernetes starts them concurrently and orders neither. A single
 * startup read therefore loses a race it cannot win, and — unlike
 * `worker.runtime`, which `APP12-H03-C1` taught to recheck — this consumer
 * stayed unconfigured for the life of the pod. `APP12-H04` measured the
 * consequence on a cold cluster: every delivery failed `NOTIFICATION_POLICY_UNAVAILABLE`,
 * exhausted the global three-attempt budget in about four seconds and
 * dead-lettered, so 100% of verification codes and `ORDER_ACCESS` links were
 * destroyed while the worker reported itself Ready. Re-reading while
 * unconfigured makes the race harmless without weakening anything: delivery
 * still fails closed until a valid policy is held.
 *
 * A missing or invalid policy is **not** an exception at load time. The process
 * stays up and the capability reports itself unconfigured; the cost lands where
 * it belongs, on the delivery attempt, which fails closed and retryable so the
 * secret survives until an operator publishes the policy.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import { NotificationDeliveryError } from '../../domain/delivery-failure';
import type {
  NotificationDeliveryPolicy,
  NotificationPolicyProblem,
} from '../../domain/notification-delivery-policy';
import {
  NOTIFICATION_DELIVERY_POLICY_KEY,
  parseNotificationDeliveryPolicy,
} from '../../domain/notification-delivery-policy';

@Injectable()
export class NotificationDeliveryPolicyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationDeliveryPolicyService.name);
  private policy: NotificationDeliveryPolicy | undefined;
  private problem: NotificationPolicyProblem | undefined;
  /**
   * The last problem this service wrote a line about.
   *
   * The same dedupe `WorkerPolicyService` carries, and for the same reason —
   * which `APP12-H04-C1` made load-bearing. The claim gate re-reads this policy
   * on the poll loop's own cadence while it is unconfigured, so an undeduped
   * line would repeat several times a second for the whole life of an
   * unconfigured pod and bury the one line an operator needs. A problem is
   * reported when it appears and when it changes; readiness carries the
   * standing state.
   */
  private reportedProblem: string | undefined;

  constructor(private readonly policies: PolicyConfigurationRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const version = await this.policies.currentValue(NOTIFICATION_DELIVERY_POLICY_KEY);

    if (version === undefined) {
      this.policy = undefined;
      this.problem = { kind: 'NOTIFICATION_POLICY_MISSING' };
      this.report(
        'NOTIFICATION_POLICY_MISSING',
        `Policy "${NOTIFICATION_DELIVERY_POLICY_KEY}" is not configured. ` +
          'Notification delivery will not send.',
      );
      return;
    }

    const result = parseNotificationDeliveryPolicy(version.value);
    if (!result.ok) {
      this.policy = undefined;
      this.problem = result.problem;
      // Reasons name fields and bounds only, never the stored value: it is
      // operator-supplied content this log has no business echoing.
      const reasons =
        result.problem.kind === 'NOTIFICATION_POLICY_INVALID'
          ? result.problem.reasons.join('; ')
          : '';
      this.report(
        `NOTIFICATION_POLICY_INVALID:${reasons}`,
        `Policy "${NOTIFICATION_DELIVERY_POLICY_KEY}" is invalid: ${reasons}. ` +
          'Notification delivery will not send.',
      );
      return;
    }

    this.policy = result.policy;
    this.problem = undefined;
    this.reportedProblem = undefined;
    this.logger.log(
      `Notification delivery policy loaded (version ${String(version.version)}, ` +
        `${String(result.policy.maxAttempts)} attempts).`,
    );
  }

  /** Writes one error line per distinct problem, not one per re-read. */
  private report(signature: string, message: string): void {
    if (this.reportedProblem === signature) {
      return;
    }
    this.reportedProblem = signature;
    this.logger.error(message);
  }

  /**
   * Re-reads the policy, but only while there is nothing usable to lose.
   *
   * The guard is the whole safety argument, so it is a guard and not a caller
   * convention: once a valid policy is held this is a no-op, and no code path
   * can swap a live delivery budget under an attempt already measured against
   * it.
   *
   * A read failure is swallowed for the `WorkerPolicyService` reason: this runs
   * inside a delivery attempt, and throwing here would replace the bounded,
   * retryable `NOTIFICATION_POLICY_UNAVAILABLE` the caller is about to raise
   * with an unclassified one. The capability stays unconfigured and the attempt
   * still fails closed, which is the same answer a failed read always produced.
   */
  async reloadWhileUnconfigured(): Promise<void> {
    if (this.policy !== undefined) {
      return;
    }
    try {
      await this.load();
    } catch {
      // Left unconfigured on purpose; the caller fails closed and retries.
    }
  }

  /** The policy, or `undefined` when delivery must stay disabled. */
  current(): NotificationDeliveryPolicy | undefined {
    return this.policy;
  }

  currentProblem(): NotificationPolicyProblem | undefined {
    return this.problem;
  }

  /** The policy, or a bounded retryable failure. The only fail-closed path. */
  require(): NotificationDeliveryPolicy {
    if (this.policy === undefined) {
      throw new NotificationDeliveryError('NOTIFICATION_POLICY_UNAVAILABLE');
    }
    return this.policy;
  }
}
