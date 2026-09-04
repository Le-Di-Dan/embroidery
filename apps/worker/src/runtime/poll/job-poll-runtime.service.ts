/**
 * The poll loop, its concurrency bound, and worker lifecycle
 * (APP2-I02 §14, §15).
 *
 * One sequential loop, never a timer that re-arms itself. A `setInterval` would
 * overlap whenever a cycle outlasts its own interval — and a cycle that claims
 * a batch and waits for slots routinely does. A recursive `setTimeout` chain
 * would be equivalent but harder to stop deterministically at shutdown.
 *
 * The loop holds no job state of its own: which job belongs to which worker,
 * and which attempt is current, live in the database and are re-checked by the
 * completion guard. That is what makes an abandoned lease recoverable rather
 * than a leak.
 */
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClaimedWorkerJob, RegisteredJobType } from '@embroidery/persistence';
import { TransactionManager, WorkerJobQueueRepository } from '@embroidery/persistence';

import type { WorkerClock } from '../clock/worker-clock';
import { WORKER_CLOCK } from '../clock/worker-clock';
import { JobExecutionService } from '../execution/job-execution.service';
import { createWorkerInstanceId } from '../identity/worker-identity';
import { WorkerFatalService } from '../lifecycle/worker-fatal.service';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { WorkerPolicyService } from '../policy/worker-policy.service';
import type { WorkerStartupGate } from '../startup/startup-gate';
import { WORKER_STARTUP_GATE } from '../startup/startup-gate';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';
import { retryDelayMs } from '../retry/retry-schedule';

export interface WorkerReadiness {
  readonly ready: boolean;
  readonly reason:
    | 'ok'
    | 'WORKER_POLICY_MISSING'
    | 'WORKER_POLICY_INVALID'
    | 'DATABASE_UNAVAILABLE'
    | 'STARTUP_GATE_CLOSED'
    | 'NOT_STARTED'
    | 'SHUTTING_DOWN'
    | 'FATAL_HANDLER_UNRESPONSIVE'
    | 'CAPABILITY_POLICY_MISSING';
  /**
   * The capabilities this worker is registered for but cannot claim yet, and
   * what each is waiting on (`APP12-H04-C1` §3).
   *
   * Reported even when `ready` is true would be misleading, so it is not: a
   * required Wave-1 execution policy that is missing makes the worker unready,
   * because a worker that silently handles four of its six capabilities is not
   * a worker an operator should believe is fine.
   */
  readonly closedGates?: readonly { readonly jobKind: string; readonly requirement: string }[];
}

/**
 * How long an unclaimable worker waits before re-probing.
 *
 * Not one of the nine policy values and not a business parameter: a worker with
 * no valid policy has nothing to poll *with*, so this only paces its "am I
 * configured yet" check. It stays a constant precisely so it cannot be mistaken
 * for tunable runtime policy.
 */
const UNCONFIGURED_RECHECK_MS = 5_000;

@Injectable()
export class JobPollRuntimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobPollRuntimeService.name);
  readonly workerInstanceId = createWorkerInstanceId();

  private readonly shutdown = new AbortController();
  private readonly inFlight = new Set<Promise<void>>();
  private loop: Promise<void> | undefined;
  private started = false;
  private databaseReady = false;
  private claimFailures = 0;
  private gateFailure: string | undefined;
  /** Last claim-gate re-check, so a closed gate is probed on a bounded cadence. */
  private lastGateRefreshAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly policies: WorkerPolicyService,
    private readonly queue: WorkerJobQueueRepository,
    private readonly transactions: TransactionManager,
    private readonly execution: JobExecutionService,
    private readonly fatal: WorkerFatalService,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
    @Inject(WORKER_STARTUP_GATE) private readonly startupGate: WorkerStartupGate,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // `APP12-H04` §W — the initial read must not be able to end the process.
    //
    // `load()` treats a *missing* or *invalid* policy as an expected startup
    // state, but a failed **read** — the database not yet accepting connections,
    // or its schema not yet migrated — propagated out of this hook, unwound Nest
    // initialization and exited. That is the crash loop the fail-closed design
    // exists to avoid, and `APP12-H04` observed it on a cold cluster: the worker
    // died once because it booted while the migration Job was still running.
    // `reloadWhileUnconfigured` already swallows exactly this failure on the poll
    // loop; the startup path now agrees with it, so an unreadable policy leaves
    // the process up, unready and claiming nothing, and the existing recheck
    // adopts the policy as soon as it can be read.
    await this.policies.reloadWhileUnconfigured();
    this.databaseReady = await this.queue.probeWorkerDatabase();

    // The gate is awaited **before** `started`, so there is no window in which
    // the loop exists and the gate does not hold (APP2-I03 §7). A closed gate
    // leaves the process up, unready and claiming nothing — the same shape as
    // a missing policy — rather than throwing out of Nest initialization and
    // stranding the database pool with no handle to close it.
    const gate = await this.startupGate.ensureReady();
    if (!gate.ok) {
      this.gateFailure = gate.errorClass;
      this.logger.error(
        `Worker startup gate closed (${gate.errorClass}); the worker will claim no job.`,
      );
      return;
    }

    this.started = true;
    this.loop = this.pollForever();

    this.logger.log(
      `Worker runtime started (${this.workerInstanceId}); ` +
        `${String(this.registry.size)} handler(s) registered.`,
    );
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    // Step 1: stop claiming. The loop notices immediately because its sleep
    // aborts rather than running to term.
    this.shutdown.abort();
    await this.loop;

    // Step 2: let work that still owns a valid lease finish normally. Aborting
    // it here would turn a job that was about to succeed into a retry. In the
    // fatal state there is nothing to wait for — the runaway handler will never
    // settle, and waiting would only spend the lease's remaining head start.
    const policy = this.policies.current();
    const graceMs = this.fatal.isFatal ? 0 : (policy?.shutdownGraceMs ?? 0);
    const finished = await this.awaitInFlight(graceMs);

    this.logger.log(`Worker runtime stopped${signal === undefined ? '' : ` (${signal})`}.`);

    if (!finished && !this.fatal.isFatal) {
      // Step 3: past the grace period with work still unsettled. Its lease is
      // deliberately **not** released — the next worker reclaims it after
      // expiry and writes the `WORKER_LEASE_EXPIRED` evidence, so no attempt
      // disappears silently. The process still has to end, and it must not
      // report success: work was forcibly abandoned, and an orchestrator
      // reading exit 0 would believe the drain completed.
      this.logger.warn(
        `${String(this.inFlight.size)} job(s) did not finish within the shutdown grace period; ` +
          'their leases will expire and be reclaimed.',
      );
      this.fatal.exitAfterForcedShutdown();
    }
  }

  /**
   * Readiness (I02 §15, extended by APP2-I03 §8): valid policy, a reachable
   * database, every startup gate open, a started runtime and no shutdown in
   * progress. Still independent of *handlers* — a worker with an empty registry
   * is correctly configured and correctly idle — but no longer independent of
   * the gates, because a worker that cannot reach its object store cannot do
   * the work it would claim.
   */
  async readiness(): Promise<WorkerReadiness> {
    // Checked first: a worker holding a lease it cannot release is unready for
    // any purpose, whatever the rest of its state says.
    if (this.fatal.isFatal) {
      return { ready: false, reason: 'FATAL_HANDLER_UNRESPONSIVE' };
    }
    if (this.shutdown.signal.aborted) {
      return { ready: false, reason: 'SHUTTING_DOWN' };
    }
    // Reported before `NOT_STARTED` so a closed gate is named as such: both are
    // "not started", but only one of them tells an operator what to fix. The
    // safe class itself is in the line the gate's owner logged.
    if (this.gateFailure !== undefined) {
      return { ready: false, reason: 'STARTUP_GATE_CLOSED' };
    }
    if (!this.started) {
      return { ready: false, reason: 'NOT_STARTED' };
    }
    const problem = this.policies.currentProblem();
    if (problem !== undefined) {
      return { ready: false, reason: problem.kind };
    }
    this.databaseReady = await this.queue.probeWorkerDatabase();
    if (!this.databaseReady) {
      return { ready: false, reason: 'DATABASE_UNAVAILABLE' };
    }
    // `APP12-H04-C1` §3, criterion 6 — readiness must state the truth about
    // what this worker can actually claim. A closed gate means a registered
    // capability is inert, so reporting `ok` would be the same silent
    // half-working state `APP12-H04` found on a cold cluster.
    const closedGates = this.registry.closedGates();
    if (closedGates.length > 0) {
      return { ready: false, reason: 'CAPABILITY_POLICY_MISSING', closedGates };
    }
    return { ready: true, reason: 'ok' };
  }

  /** Test seam: how many attempts are executing right now. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private async pollForever(): Promise<void> {
    const { signal } = this.shutdown;

    while (!signal.aborted) {
      if (this.fatal.isFatal) {
        // The fatal state is set synchronously before anything is awaited, so
        // the loop observes it on its next turn and no further claim can be
        // issued while the process is closing down.
        this.logger.warn('Fatal runtime state: claiming stopped.');
        break;
      }
      const policy = this.policies.current();
      if (policy === undefined) {
        await this.clock.sleep(UNCONFIGURED_RECHECK_MS, signal);
        // `APP12-H03-C1`: the recheck this constant was named for now actually
        // rechecks. It used to sleep and loop on a value that could only ever
        // have been set once, at bootstrap — so a worker that started before
        // its policy was published stayed idle until a human restarted the pod,
        // which is what a cold cluster showed in `APP12-H03`. The service
        // ignores the call once it holds a valid policy, so this cannot reload
        // a running fleet's lease duration.
        await this.policies.reloadWhileUnconfigured();
        continue;
      }

      // `APP12-H04-C1` §3 — re-check any closed claim gate before deciding what
      // this cycle may claim. Only closed gates are touched, so the steady state
      // costs nothing; a capability whose policy is published while the worker
      // runs becomes claimable shortly afterwards, with no restart.
      //
      // Paced on the same `UNCONFIGURED_RECHECK_MS` the missing-`worker.runtime`
      // branch uses, rather than on `pollIntervalMs`: a closed gate re-reads a
      // policy row, and doing that twice a second for the life of an
      // unconfigured pod is a database load nobody asked for. The bound on how
      // late adoption can be is this interval, which is the same bound the
      // delivered runtime-policy recheck already accepts.
      await this.refreshClaimGatesPaced();

      const registeredTypes = this.registry.registeredTypes();
      if (registeredTypes.length === 0) {
        // An empty registry issues no claim query at all. Sleeping here rather
        // than calling through keeps "handles nothing" and "handles
        // everything" structurally impossible to confuse.
        await this.clock.sleep(policy.pollIntervalMs, signal);
        continue;
      }

      const slots = policy.concurrency - this.inFlight.size;
      if (slots <= 0) {
        // Wait for a slot instead of spinning: the loop must never busy-poll.
        // Raced against shutdown, because a handler that never returns would
        // otherwise pin the loop here and make SIGTERM hang forever.
        await Promise.race([...this.inFlight, aborted(signal)]);
        continue;
      }

      const claimed = await this.claim(policy, registeredTypes, slots, signal);
      if (claimed === undefined) {
        continue;
      }
      if (claimed.length === 0) {
        await this.clock.sleep(policy.pollIntervalMs, signal);
        continue;
      }

      for (const job of claimed) {
        this.track(
          this.execution
            .run(job, policy, this.workerInstanceId)
            .then(() => undefined)
            .catch((error: unknown) => {
              // One job's failure must not stop its siblings or the loop. The
              // execution service already classifies handler errors, so
              // anything reaching here is a runtime defect worth a loud line.
              this.logger.error(
                `Unhandled failure while executing job ${job.outboxEventId.toString()}: ` +
                  (error instanceof Error ? error.name : 'unknown error'),
              );
            }),
        );
      }
    }

    this.logger.log('Poll loop stopped claiming.');
  }

  /**
   * Re-checks closed claim gates, at most once per {@link UNCONFIGURED_RECHECK_MS}.
   *
   * The registry already skips gates that are open, so this only paces the
   * "am I configured yet" probe of the ones that are shut.
   */
  private async refreshClaimGatesPaced(): Promise<void> {
    const now = this.clock.now();
    if (now - this.lastGateRefreshAt < UNCONFIGURED_RECHECK_MS) {
      return;
    }
    this.lastGateRefreshAt = now;
    await this.registry.refreshClaimGates();
  }

  /** Returns claimed jobs, or `undefined` when the claim failed and was paced. */
  private async claim(
    policy: WorkerRuntimePolicy,
    registeredTypes: readonly RegisteredJobType[],
    slots: number,
    signal: AbortSignal,
  ): Promise<ClaimedWorkerJob[] | undefined> {
    try {
      const claimed = await this.transactions.runInTransaction(() =>
        this.queue.claimRegisteredBatch({
          workerInstanceId: this.workerInstanceId,
          registeredTypes,
          // Never lease more than can start now: a leased job nobody is
          // executing is a job whose lease is already burning down.
          batchSize: Math.min(policy.batchSize, slots),
          leaseDurationMs: policy.leaseDurationMs,
        }),
      );
      this.claimFailures = 0;
      this.databaseReady = true;
      return claimed;
    } catch (error: unknown) {
      this.claimFailures += 1;
      this.databaseReady = false;
      // Bounded, safe backoff reusing the same capped formula as job retries —
      // a database outage must not turn into a tight reconnect loop. The bound
      // is the operator's own `backoffMaxMs`, not a second invented ceiling.
      const delay = retryDelayMs(this.claimFailures, policy.backoffBaseMs, policy.backoffMaxMs);
      this.logger.error(
        `Claim failed (${String(this.claimFailures)} in a row): ` +
          (error instanceof Error ? error.name : 'unknown error'),
      );
      await this.clock.sleep(delay, signal);
      return undefined;
    }
  }

  private track(work: Promise<void>): void {
    const tracked = work.finally(() => {
      this.inFlight.delete(tracked);
    });
    this.inFlight.add(tracked);
  }

  /** True when everything finished inside the grace period. */
  private async awaitInFlight(graceMs: number): Promise<boolean> {
    if (this.inFlight.size === 0) {
      return true;
    }
    await Promise.race([Promise.allSettled([...this.inFlight]), this.clock.sleep(graceMs)]);
    return this.inFlight.size === 0;
  }
}

/** Resolves when the signal aborts. Never rejects, so it is safe in a race. */
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
