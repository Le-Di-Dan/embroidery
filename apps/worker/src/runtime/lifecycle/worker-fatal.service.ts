/**
 * The fatal-state machine for an unresponsive handler (APP2-I02-C1 §5.5, §6).
 *
 * Reached only when a timed-out handler is still unsettled at the hard-stop
 * deadline. At that point the runtime has two options and only one of them is
 * safe:
 *
 * - Release the lease and carry on. The old handler is still running, so a
 *   retry of the same job — same `effectKey` — can execute concurrently with
 *   it. That is the overlap the lease exists to prevent.
 * - Leave the row exactly as claimed and end the process. Nobody touches the
 *   job until the lease expires, and the worker that reclaims it then writes
 *   the single `WORKER_LEASE_EXPIRED` attempt for the abandoned attempt number.
 *
 * The second is the only one that preserves the invariant, so this service
 * exists to do it exactly once, quickly, and without releasing anything.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { JobLogFields } from '../logging/job-log-fields';
import { formatJobLogLine } from '../logging/job-log-fields';
import type { WorkerProcess } from './worker-process';
import { FATAL_EXIT_SAFETY_MS, WORKER_PROCESS } from './worker-process';

export type WorkerRuntimeState = 'HEALTHY' | 'FATAL_HANDLER_UNRESPONSIVE';

@Injectable()
export class WorkerFatalService {
  private readonly logger = new Logger(WorkerFatalService.name);
  private state: WorkerRuntimeState = 'HEALTHY';
  private closer: (() => Promise<void>) | undefined;
  private closed = false;
  private triggered = false;

  constructor(@Inject(WORKER_PROCESS) private readonly process: WorkerProcess) {}

  /**
   * Supplies the one-shot context/pool close.
   *
   * Registered by the composition root (or by a test harness) because the
   * runtime cannot reach the application context that owns it.
   */
  registerCloser(close: () => Promise<void>): void {
    this.closer = close;
  }

  get runtimeState(): WorkerRuntimeState {
    return this.state;
  }

  get isFatal(): boolean {
    return this.state === 'FATAL_HANDLER_UNRESPONSIVE';
  }

  /**
   * Enters the fatal state and ends the process.
   *
   * The state flips **synchronously** before anything is awaited, so the poll
   * loop and readiness observe it on their very next check and no further claim
   * can be issued while the close is in flight.
   *
   * Idempotent: a second unresponsive handler in the same process must not
   * produce a second fatal log or a second exit.
   */
  async triggerUnresponsiveHandler(fields: JobLogFields): Promise<void> {
    if (this.triggered) {
      return;
    }
    this.triggered = true;
    this.state = 'FATAL_HANDLER_UNRESPONSIVE';

    // Exactly one fatal line, from the same allow-list projection as every
    // other job log — no payload, no return value, no stack, no raw error.
    this.logger.error(formatJobLogLine({ ...fields, outcome: 'FATAL_HANDLER_UNRESPONSIVE' }));

    // The close is bounded by the same budget the hard-stop deadline reserved.
    // A pool that refuses to close must not cost the lease its head start —
    // exiting late would let the next worker reclaim the job while this one is
    // still running the handler, which is the whole failure being prevented.
    await Promise.race([this.closeOnce(), delay(FATAL_EXIT_SAFETY_MS)]);
    this.process.exit(1);
  }

  /**
   * Ends the process after a graceful shutdown could not finish its work.
   *
   * Distinct from the fatal path: here the context is already closing, so this
   * only decides the exit code. Non-zero because work was forcibly abandoned —
   * reporting success would tell an orchestrator the drain completed.
   */
  exitAfterForcedShutdown(): void {
    if (this.triggered) {
      return;
    }
    this.triggered = true;
    this.process.exit(1);
  }

  /** Closes the application context and pool at most once. */
  private async closeOnce(): Promise<void> {
    if (this.closed || this.closer === undefined) {
      return;
    }
    this.closed = true;
    try {
      await this.closer();
    } catch (error: unknown) {
      // A failed close must never prevent the exit; the exit is the guarantee.
      this.logger.error(
        `Closing the worker context during fatal shutdown failed: ` +
          (error instanceof Error ? error.name : 'unknown error'),
      );
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms);
    handle.unref?.();
  });
}
