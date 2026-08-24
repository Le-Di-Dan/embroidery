/**
 * Deterministic control over the two runtimes `APP7-E01` drives, and the one
 * APP8 hand-off port it interrogates.
 *
 * ### The worker
 *
 * Built on `support/app4/worker-control.mjs`, not beside it: that module already
 * claims through the production `WorkerJobQueueRepository` and executes through
 * the production `JobExecutionService`, with the startup gate held closed so the
 * poll loop claims nothing. `APP7-W01`'s own harness holds it closed for the
 * same reason — a background loop racing an assertion makes "did a second
 * conversion run?" unanswerable. The only thing this file adds is *which* jobs
 * and *how many*, because E01 runs three distinct handlers off one queue:
 * `design.approved` (the order conversion) and `asset.inspection.requested` (the
 * transfer-evidence lane), plus whatever notification delivery the run's own
 * step-up issues.
 *
 * ### The hand-off port
 *
 * `DepositEligibilityPort` is resolved out of the **API's real graph**, so
 * `isDepositSatisfied` is the implementation APP8 will consume — not a SQL
 * re-statement of what it is believed to do. `APP7-E01` §13 forbids creating it
 * here, and nothing below does: it is looked up, and a missing token is a
 * failure the case reports rather than a gap the harness fills.
 *
 * Test-only. Never imported by application code.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';
import { createWorkerControl } from '../app4/worker-control.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/**
 * The evidence-inspection wait bound `APP7-E01` §12 fixes.
 *
 * Test-internal waiting on an asynchronous lane, never product polling: nothing
 * the customer's browser does is on this timer, and the payment screen has no
 * poll of its own.
 */
export const INSPECTION_WAIT = Object.freeze({ timeoutMs: 20_000, intervalMs: 250 });

export function createApp7Control(runtime) {
  const { DEPOSIT_ELIGIBILITY_PORT } = requireFromApi('@embroidery/persistence');
  const worker = createWorkerControl(runtime);

  const eligibility = runtime.apiContext.get(DEPOSIT_ELIGIBILITY_PORT, { strict: false });
  if (eligibility === undefined || eligibility === null) {
    // §13: the port is APP7's promised hand-off. E01 reports its absence and
    // does not invent one.
    throw new Error('APP8_HANDOFF_PORT_MISSING: DEPOSIT_ELIGIBILITY_PORT is not in the API graph.');
  }

  /**
   * Runs due jobs one at a time until the queue has nothing left.
   *
   * `max` is a runaway guard, not a schedule: a handler that keeps re-enqueuing
   * itself must fail the case loudly rather than spin. Every attempt goes
   * through the production execution path, so a terminal refusal is recorded in
   * `background_job_attempts` exactly as it would be in production.
   */
  async function drainJobs(max = 12) {
    const summaries = [];
    for (let index = 0; index < max; index += 1) {
      const summary = await worker.runOnce();
      if (summary === undefined) {
        return summaries;
      }
      summaries.push(summary);
    }
    throw new Error(`APP7-E01: the job queue did not drain within ${String(max)} attempts.`);
  }

  return {
    ...worker,
    drainJobs,

    /** The real APP8 hand-off answer for one order. Never a SQL restatement. */
    isDepositSatisfied: (orderId) => eligibility.isDepositSatisfied(orderId),

    /**
     * Waits, within `APP7-E01` §12's bound, for a predicate to hold — draining
     * the queue between polls so an asynchronous lane can actually advance.
     *
     * Returns the settled value, or throws naming what never settled. It does
     * not retry a *case*: it lets one already-running lane finish.
     */
    settle: async (label, read, isSettled) => {
      const deadline = Date.now() + INSPECTION_WAIT.timeoutMs;
      let last;
      for (;;) {
        await drainJobs();
        last = await read();
        if (isSettled(last)) {
          return last;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `APP7-E01: ${label} did not settle within ${String(INSPECTION_WAIT.timeoutMs)} ms.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, INSPECTION_WAIT.intervalMs));
      }
    },
  };
}
