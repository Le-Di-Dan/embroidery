/**
 * Deterministic control over the real `APP4-W01` delivery runtime (E01-H02).
 *
 * Built on H01's in-process worker context, so there is exactly one worker in
 * the topology and no second implementation: this claims through the same
 * repository the poll loop claims through, and executes through the same
 * `JobExecutionService` the loop executes through. The only difference is who
 * decides *when* — which is the whole point, because the delivery policy's
 * `[60, 300]`-second retry schedule cannot be observed by a suite that waits.
 *
 * The recording adapter stays in this process. Nothing here writes a secret
 * anywhere: the two readers below return the delivery record's safe shape, and
 * the plaintext is handed back only through `secretOf`, which callers pass
 * straight into a boolean comparison.
 *
 * Test-only.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';

const requireFromWorker = createRequire(join(REPO_ROOT, 'apps', 'worker', 'package.json'));

/**
 * One claim per call.
 *
 * A larger batch would lease rows the harness then never executes, and a later
 * assertion about "no second send" would be measuring an abandoned lease instead
 * of the guard it targets — the reason `APP4-W01`'s own context uses 1.
 */
const RUNTIME_POLICY = Object.freeze({
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 25,
  leaseDurationMs: 5_000,
  handlerTimeoutMs: 5_000,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 300,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
});

/** The three delivery outcomes E01 scripts, named so call sites read as intent. */
export const DELIVERY_OUTCOME = Object.freeze({
  SENT: { outcome: 'SENT' },
  RETRYABLE_FAILURE: { outcome: 'FAILED', retryable: true },
  TERMINAL_FAILURE: { outcome: 'FAILED', retryable: false },
});

/**
 * @param {{ workerContext: object, jobExecutionService: object, recordingAdapter: object }} runtime
 */
export function createWorkerControl(runtime) {
  const { TransactionManager, WorkerJobQueueRepository } =
    requireFromWorker('@embroidery/persistence');
  const { JobHandlerRegistry } = requireFromWorker(
    './dist/runtime/registry/job-handler.registry.js',
  );

  const transactions = runtime.workerContext.get(TransactionManager);
  const queue = runtime.workerContext.get(WorkerJobQueueRepository);
  const registry = runtime.workerContext.get(JobHandlerRegistry);
  const adapter = runtime.recordingAdapter;
  const workerInstanceId = `app4-e01-${Date.now().toString(36)}`;

  return {
    workerInstanceId,

    /** Scripts what the adapter *reports*; it never changes what it is sent. */
    program: (...outcomes) => adapter.program(...outcomes),
    reset: () => adapter.reset(),

    /**
     * Claims the next due job and runs exactly one attempt, as the loop would.
     * Returns the runtime's own attempt summary, or `undefined` when nothing was
     * due — which is itself evidence (E01-02's "no second send").
     */
    runOnce: async () => {
      const claimed = await transactions.runInTransaction(() =>
        queue.claimRegisteredBatch({
          workerInstanceId,
          registeredTypes: registry.registeredTypes(),
          batchSize: 1,
          leaseDurationMs: RUNTIME_POLICY.leaseDurationMs,
        }),
      );
      const job = claimed[0];
      return job === undefined
        ? undefined
        : await runtime.jobExecutionService.run(job, RUNTIME_POLICY, workerInstanceId);
    },

    /** How many deliveries this process has recorded. Never the contents. */
    deliveryCount: () => adapter.records().length,

    /**
     * The safe shape of one recorded delivery — every field except the secret
     * and the composed link, both of which carry secret material.
     */
    safeDelivery: (index = 0) => {
      const record = adapter.records()[index];
      if (record === undefined) {
        return undefined;
      }
      return {
        channel: record.channel,
        secretKind: record.secretKind,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        hasSecret: typeof record.secret === 'string' && record.secret.length > 0,
        hasSecureLinkUrl: typeof record.secureLinkUrl === 'string',
        recipientMasked: maskRecipient(record.normalizedRecipient),
      };
    },

    /**
     * The delivered plaintext, for boolean comparison only.
     *
     * Deliberately a separate, explicitly named accessor rather than a field on
     * `safeDelivery`: a caller has to ask for the secret on purpose, and the
     * only sanctioned next step is `assertSecretEqual` / `assertSecretDifferent`.
     */
    secretOf: (index = 0) => adapter.records()[index]?.secret,

    /** The composed secure link, for in-memory navigation only. Never printed. */
    secureLinkOf: (index = 0) => adapter.records()[index]?.secureLinkUrl,
  };
}

/**
 * Masks a recipient for diagnostics: enough to tell two fixtures apart, never
 * enough to reconstruct the contact.
 */
function maskRecipient(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
