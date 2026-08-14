/**
 * Reads the `verification.challenge` policy at the point of use (`APP4-B03`).
 *
 * Per request rather than once at bootstrap, which is the difference between an
 * API consumer and the worker's `WorkerPolicyService`: an API process is started
 * by a deployment that may not yet have run `staff-bootstrap`, and a worker that
 * claims nothing until an operator publishes is a safe idle state while an API
 * that refuses forever until it is restarted is not. `PolicyModule`'s own
 * documentation states the rule — "consumers resolve their own values through
 * `PolicyConfigurationRepository` at the point of use" — and there is no cache
 * here for the same reason.
 *
 * This class has no publish path and no Admin identity, and must not acquire
 * either: publication is closed by `APP4-B01-C1`, and a consumer that can write
 * its own policy is not consuming one.
 *
 * A missing or malformed value is a bounded refusal, never an exception that
 * reaches HTTP as a 500. The endpoint issues nothing, which is the correct
 * fail-closed behaviour: a challenge issued under a guessed TTL is a credential
 * with an unknown lifetime.
 */
import { Injectable } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import {
  VERIFICATION_CHALLENGE_POLICY_KEY,
  parseVerificationChallengePolicy,
  type VerificationChallengePolicy,
} from '../../domain/verification/verification-challenge-policy';
import { VerificationIssueError } from '../../domain/verification/verification-issue-outcome';

@Injectable()
export class VerificationPolicyReader {
  constructor(private readonly policies: PolicyConfigurationRepository) {}

  /**
   * The published policy, or a bounded failure.
   *
   * The parse reasons are deliberately dropped rather than logged here: they
   * name fields and bounds, which is useful, but the caller is a public endpoint
   * and this method is on its hot path. The operator-facing signal is the
   * absence of the key in `policy_configurations`, which is directly
   * inspectable.
   */
  async require(): Promise<VerificationChallengePolicy> {
    const version = await this.policies.currentValue(VERIFICATION_CHALLENGE_POLICY_KEY);
    if (version === undefined) {
      throw new VerificationIssueError('VERIFICATION_POLICY_UNAVAILABLE');
    }
    const result = parseVerificationChallengePolicy(version.value);
    if (!result.ok) {
      throw new VerificationIssueError('VERIFICATION_POLICY_UNAVAILABLE');
    }
    return result.policy;
  }
}
