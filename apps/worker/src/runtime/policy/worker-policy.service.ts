/**
 * Loads the worker runtime policy from its canonical source (APP2-I02 §12).
 *
 * The source is `policy_configurations` / `policy_configuration_versions` via
 * `PolicyConfigurationRepository.currentValue` — the read path DB7 already
 * built for exactly this purpose. No new persistence method was needed and no
 * migration is involved.
 *
 * Loaded once at startup. Hot reload is out of scope for APP2: changing the
 * lease duration under a running fleet would leave in-flight jobs holding
 * leases measured against a policy that no longer exists.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PolicyConfigurationRepository } from '@embroidery/persistence';

import type { WorkerPolicyProblem, WorkerRuntimePolicy } from './worker-runtime-policy';
import { WORKER_RUNTIME_POLICY_KEY, parseWorkerRuntimePolicy } from './worker-runtime-policy';

@Injectable()
export class WorkerPolicyService {
  private readonly logger = new Logger(WorkerPolicyService.name);
  private policy: WorkerRuntimePolicy | undefined;
  private problem: WorkerPolicyProblem | undefined;

  constructor(private readonly policies: PolicyConfigurationRepository) {}

  /**
   * Reads and validates the policy.
   *
   * A missing or invalid policy is **not** an exception: the process must stay
   * up, report itself unready and claim nothing, so an operator can publish the
   * policy without a crash loop obscuring the error.
   */
  async load(): Promise<void> {
    const version = await this.policies.currentValue(WORKER_RUNTIME_POLICY_KEY);

    if (version === undefined) {
      this.policy = undefined;
      this.problem = { kind: 'WORKER_POLICY_MISSING' };
      this.logger.error(
        `Worker runtime policy "${WORKER_RUNTIME_POLICY_KEY}" is not configured. ` +
          'The worker is running but will not claim any job.',
      );
      return;
    }

    const result = parseWorkerRuntimePolicy(version.value);
    if (!result.ok) {
      this.policy = undefined;
      this.problem = result.problem;
      // Reasons name fields and bounds only — never the stored value, which is
      // operator-supplied content this log has no business echoing.
      const reasons =
        result.problem.kind === 'WORKER_POLICY_INVALID' ? result.problem.reasons.join('; ') : '';
      this.logger.error(
        `Worker runtime policy "${WORKER_RUNTIME_POLICY_KEY}" is invalid: ${reasons}. ` +
          'The worker is running but will not claim any job.',
      );
      return;
    }

    this.policy = result.policy;
    this.problem = undefined;
    this.logger.log(
      `Worker runtime policy loaded (version ${String(version.version)}, ` +
        `concurrency ${String(result.policy.concurrency)}).`,
    );
  }

  /** The policy, or undefined when claiming must stay disabled. */
  current(): WorkerRuntimePolicy | undefined {
    return this.policy;
  }

  /** The stable signal a readiness probe reports. */
  currentProblem(): WorkerPolicyProblem | undefined {
    return this.problem;
  }
}
