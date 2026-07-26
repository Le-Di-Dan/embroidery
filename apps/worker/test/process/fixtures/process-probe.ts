/**
 * The out-of-band event recorder shared by both process fixtures (FD1 §6).
 *
 * Deliberately its own connection rather than the worker's pool: worker A dies
 * by `process.exit(1)` while its Nest context is closing, and a probe row that
 * travelled through the pool being torn down would be exactly the evidence most
 * likely to go missing. This client is opened once, used for single-statement
 * inserts, and abandoned when the process ends.
 *
 * Test-only. Compiled solely by the `process-test` Docker target and never
 * copied into the production `runner` image.
 */
import { createDatabaseClient, executeRaw, loadDatabaseConfig, sql } from '@embroidery/database';
import type { DatabaseClient } from '@embroidery/database';

/** The closed set of probe events (FD1 §6). */
export type ProbeEvent =
  | 'PROCESS_START'
  | 'PROCESS_READY'
  | 'HANDLER_STARTED'
  | 'HANDLER_SUCCEEDED'
  | 'FATAL_STATE_ENTERED'
  | 'PROCESS_STOPPING';

let client: DatabaseClient | undefined;

function probeClient(): DatabaseClient {
  client ??= createDatabaseClient(loadDatabaseConfig({ ...process.env, NODE_ENV: 'test' }));
  return client;
}

/**
 * Records one event. `recorded_at` defaults to the **database's**
 * `clock_timestamp()`, so every probe row and the lease deadline are stamped by
 * the same clock and can be compared without trusting a container's.
 */
export async function recordProbe(input: {
  jobKey: string;
  workerRole: string;
  workerId: string;
  event: ProbeEvent;
}): Promise<void> {
  await executeRaw(
    probeClient().db,
    sql`
      INSERT INTO worker_runtime_process_probe (job_key, worker_role, worker_id, event_name)
      VALUES (${input.jobKey}, ${input.workerRole}, ${input.workerId}, ${input.event})
    `,
  );
}

/** The event type both fixtures handle. Never a real domain event. */
export const PROCESS_TEST_EVENT = 'test.worker.uncooperative-timeout';
