/**
 * Reads the `notification.delivery` policy from its canonical source
 * (`APP4-B01-C1` published it; `APP4-W01` only consumes it).
 *
 * Same path and same shape as `WorkerPolicyService`:
 * `PolicyConfigurationRepository.currentValue`, loaded once at bootstrap, no
 * hot reload, no environment variable, no default. This class has no publish
 * method and no Admin identity, and it must not acquire either — publication is
 * closed, and a consumer that can write its own policy is not consuming one.
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

  constructor(private readonly policies: PolicyConfigurationRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const version = await this.policies.currentValue(NOTIFICATION_DELIVERY_POLICY_KEY);

    if (version === undefined) {
      this.policy = undefined;
      this.problem = { kind: 'NOTIFICATION_POLICY_MISSING' };
      this.logger.error(
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
      this.logger.error(
        `Policy "${NOTIFICATION_DELIVERY_POLICY_KEY}" is invalid: ${reasons}. ` +
          'Notification delivery will not send.',
      );
      return;
    }

    this.policy = result.policy;
    this.problem = undefined;
    this.logger.log(
      `Notification delivery policy loaded (version ${String(version.version)}, ` +
        `${String(result.policy.maxAttempts)} attempts).`,
    );
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
