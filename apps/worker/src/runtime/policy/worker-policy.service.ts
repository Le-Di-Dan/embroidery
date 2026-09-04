/**
 * Loads the worker runtime policy from its canonical source (APP2-I02 §12).
 *
 * The source is `policy_configurations` / `policy_configuration_versions` via
 * `PolicyConfigurationRepository.currentValue` — the read path DB7 already
 * built for exactly this purpose. No new persistence method was needed and no
 * migration is involved.
 *
 * Loaded once at startup, and re-read **only while the worker has no usable
 * policy** (`APP12-H03-C1` §4, §5). Hot reload of a *valid* policy stays out of
 * scope for the APP2 reason: changing the lease duration under a running fleet
 * would leave in-flight jobs holding leases measured against a policy that no
 * longer exists. The unconfigured case has no such hazard — a worker that has
 * never had a policy holds no lease and has claimed nothing — and leaving it out
 * is what made a correct deployment fail:
 *
 * The policy is published by the `staff-bootstrap` Job and the worker is a
 * Deployment; Kubernetes starts them concurrently and orders neither. A
 * single startup read therefore loses a race it cannot win, and the loser stays
 * idle until a human notices and restarts the pod — which is precisely the state
 * `APP12-H03` found in a cold cluster. Re-reading while unconfigured makes the
 * race harmless without weakening anything: the worker still claims nothing
 * until it holds a valid policy.
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
  /**
   * The last problem this service wrote a line about.
   *
   * The unconfigured re-read runs on the poll loop's own recheck interval, so
   * logging every attempt would emit the same error several times a minute for
   * the whole life of an unconfigured pod and bury the one line that matters.
   * A problem is reported when it appears and when it changes; the readiness
   * probe carries the standing state.
   */
  private reportedProblem: string | undefined;

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
      this.report(
        'WORKER_POLICY_MISSING',
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
      this.report(
        `WORKER_POLICY_INVALID:${reasons}`,
        `Worker runtime policy "${WORKER_RUNTIME_POLICY_KEY}" is invalid: ${reasons}. ` +
          'The worker is running but will not claim any job.',
      );
      return;
    }

    this.policy = result.policy;
    this.problem = undefined;
    this.reportedProblem = undefined;
    this.logger.log(
      `Worker runtime policy loaded (version ${String(version.version)}, ` +
        `concurrency ${String(result.policy.concurrency)}).`,
    );
  }

  /**
   * Re-reads the policy, but only while there is nothing usable to lose.
   *
   * The guard is the whole safety argument, so it is a guard and not a caller
   * convention: once a valid policy is held this is a no-op, and no code path
   * can swap the lease duration under a job that is already leased against it.
   *
   * A read failure — an unreachable database during the window between the
   * worker starting and its bootstrap Job finishing is the ordinary case — is
   * swallowed on purpose. This runs on the poll loop; throwing here would turn
   * "not configured yet" into an unhandled rejection in the loop that exists to
   * survive exactly this state. The worker stays unready and claims nothing,
   * which is the same answer a failed read has always produced.
   */
  async reloadWhileUnconfigured(): Promise<void> {
    if (this.policy !== undefined) {
      return;
    }
    try {
      await this.load();
    } catch (error: unknown) {
      this.report(
        `WORKER_POLICY_UNREADABLE:${error instanceof Error ? error.name : 'unknown'}`,
        'Worker runtime policy could not be read; the worker will keep retrying and claims nothing.',
      );
    }
  }

  /** Writes one error line per distinct problem, not one per attempt. */
  private report(signature: string, message: string): void {
    if (this.reportedProblem === signature) {
      return;
    }
    this.reportedProblem = signature;
    this.logger.error(message);
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
