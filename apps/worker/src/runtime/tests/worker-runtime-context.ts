/**
 * Live-worker harness for the APP2-I02 runtime integration suites.
 *
 * Boots the real `WorkerModule` — real poll loop, real claim/completion
 * transactions, real Nest lifecycle — against a disposable database with all 31
 * migrations applied. Handlers are registered before `init()`, which is the
 * same moment production registration would happen.
 *
 * Test-only. Build-excluded via `src/**` + `tests/**`.
 */
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
// `sql`/`executeRaw` come from the database package's sanctioned raw-SQL
// boundary (ADR-DB1-002), not from Drizzle directly: the worker application
// must never depend on the ORM or the driver, not even in a test.
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import {
  DatabaseModule,
  PolicyConfigurationRepository,
  TransactionManager,
} from '@embroidery/persistence';

import { WorkerModule } from '../../bootstrap/worker.module';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { WorkerFatalService } from '../lifecycle/worker-fatal.service';
import { WORKER_PROCESS } from '../lifecycle/worker-process';
import type { JobHandler } from '../registry/job-handler';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';
import {
  WORKER_RUNTIME_POLICY_KEY,
  WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
} from '../policy/worker-runtime-policy';

export const SYNTHETIC_EVENT_ALPHA = 'app2.i02.synthetic.alpha';
export const SYNTHETIC_EVENT_BETA = 'app2.i02.synthetic.beta';

/** Short intervals so the suite exercises real timing without real waiting. */
export const FAST_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 25,
  leaseDurationMs: 5_000,
  handlerTimeoutMs: 300,
  // Must exceed the 250 ms fatal-exit reserve; 1 s also keeps the hard-stop
  // deadline (timeout + margin) comfortably inside the 5 s lease.
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 300,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
};

export interface WorkerRuntimeContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  /**
   * Exit codes the runtime asked the process seam for.
   *
   * The seam is overridden here so a fatal exit is *observable* instead of
   * killing the Jest worker mid-suite. The production wiring is the real
   * `process.exit`, and the Docker signal smoke exercises that one.
   */
  readonly exits: number[];
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

export interface StartWorkerOptions {
  readonly label: string;
  readonly handlers?: readonly JobHandler[];
  /** Omit the policy entirely to exercise the unconfigured-worker path. */
  readonly policy?: WorkerRuntimePolicy | undefined;
  readonly withPolicy?: boolean;
  /**
   * Attach a second worker to a database another context already owns.
   *
   * Needed to prove a reclaim: two runtimes with distinct instance ids must
   * contend for the *same* rows, and the owner of the database keeps
   * responsibility for dropping it.
   */
  readonly existing?: DisposableDatabase | undefined;
}

export async function startWorkerRuntime(
  options: StartWorkerOptions,
): Promise<WorkerRuntimeContext> {
  const attached = options.existing !== undefined;
  const disposable = options.existing ?? (await createDisposableDatabase(options.label));
  const previousUrl = process.env['DATABASE_URL'];
  const previousEnv = process.env['NODE_ENV'];
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';

  const exits: number[] = [];
  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({
        exit: (code: number) => {
          exits.push(code);
        },
      })
      .compile();

    // An attached worker reuses the policy the database already carries;
    // publishing a second version would test the wrong thing.
    if (options.withPolicy !== false && !attached) {
      await publishWorkerPolicy(moduleRef, disposable, options.policy ?? FAST_POLICY);
    }
    // Registration happens before `init()`, exactly as a production module
    // would register its handlers during construction.
    moduleRef.get(JobHandlerRegistry).registerAll(options.handlers ?? []);

    await moduleRef.init();
  } catch (error: unknown) {
    if (!attached) {
      await disposable.drop();
    }
    throw error;
  }

  // The fatal path closes the context itself, exactly as `main.ts` wires it.
  moduleRef.get(WorkerFatalService).registerCloser(() => moduleRef.close());

  let closed = false;
  return {
    moduleRef,
    disposable,
    exits,
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),
    close: async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      await moduleRef.close();
      if (previousUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = previousUrl;
      }
      if (previousEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previousEnv;
      }
      // An attached worker never drops a database it does not own.
      if (!attached) {
        await disposable.drop();
      }
    },
  };
}

/**
 * Publishes the policy into a database no worker is attached to.
 *
 * Used by the smoke test, which starts the real `dist/main.js` as a separate
 * OS process and therefore cannot seed through that process's own container.
 */
export async function seedWorkerPolicy(
  disposable: DisposableDatabase,
  policy: WorkerRuntimePolicy = FAST_POLICY,
): Promise<void> {
  const previousUrl = process.env['DATABASE_URL'];
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';
  const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
  try {
    await publishWorkerPolicy(moduleRef, disposable, policy);
  } finally {
    await moduleRef.close();
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
  }
}

/** Publishes the policy through its canonical versioned path — no shortcut. */
async function publishWorkerPolicy(
  moduleRef: TestingModule,
  disposable: DisposableDatabase,
  policy: WorkerRuntimePolicy,
): Promise<void> {
  const adminId = newId();
  await executeRaw(
    disposable.client.db,
    sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`i02-${adminId}@example.com`}, 'I02 Fixture', 'ACTIVE')
  `,
  );

  const policies = moduleRef.get(PolicyConfigurationRepository);
  await moduleRef.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(WORKER_RUNTIME_POLICY_KEY, 'Worker runtime policy (APP2-I02).');
    await policies.publishVersion({
      configKey: WORKER_RUNTIME_POLICY_KEY,
      value: { ...policy },
      valueSchemaVersion: WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP2-I02 integration fixture.',
    });
  });
}

export interface SeedEventInput {
  readonly eventType?: string;
  readonly payload?: Record<string, unknown>;
  readonly payloadSchemaVersion?: number;
}

/** Inserts a due, unclaimed outbox event and returns its id. */
export async function seedDueEvent(
  disposable: DisposableDatabase,
  input: SeedEventInput = {},
): Promise<bigint> {
  const result = await executeRaw(
    disposable.client.db,
    sql`
    INSERT INTO outbox_events
      (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
       status, attempt_count, next_attempt_at)
    VALUES (
      ${input.eventType ?? SYNTHETIC_EVENT_ALPHA},
      'CUSTOM_REQUEST',
      ${newId()},
      ${JSON.stringify(input.payload ?? { marker: 'i02' })}::jsonb,
      ${input.payloadSchemaVersion ?? 1},
      'PENDING', 0, NULL
    )
    RETURNING id
  `,
  );
  const rows = rowsOf(result);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Seeding a due event returned no row.');
  }
  return BigInt(String(row['id']));
}

export interface OutboxState {
  readonly status: string;
  readonly attemptCount: number;
  readonly claimedBy: string | null;
  readonly lastError: string | null;
}

export async function outboxState(
  disposable: DisposableDatabase,
  id: bigint,
): Promise<OutboxState> {
  const result = await executeRaw(
    disposable.client.db,
    sql`
    SELECT status, attempt_count, claimed_by, last_error FROM outbox_events WHERE id = ${id}
  `,
  );
  const row = rowsOf(result)[0] ?? {};
  return {
    status: String(row['status']),
    attemptCount: Number(row['attempt_count']),
    claimedBy: typeof row['claimed_by'] === 'string' ? row['claimed_by'] : null,
    lastError: typeof row['last_error'] === 'string' ? row['last_error'] : null,
  };
}

export async function attemptsFor(
  disposable: DisposableDatabase,
  id: bigint,
): Promise<{ attemptNo: number; outcome: string; errorClass: string | null }[]> {
  const result = await executeRaw(
    disposable.client.db,
    sql`
    SELECT attempt_no, outcome, error_class FROM background_job_attempts
    WHERE job_key = ${id.toString()} ORDER BY attempt_no, id
  `,
  );
  return rowsOf(result).map((row) => ({
    attemptNo: Number(row['attempt_no']),
    outcome: String(row['outcome']),
    errorClass: typeof row['error_class'] === 'string' ? row['error_class'] : null,
  }));
}

export async function countByStatus(
  disposable: DisposableDatabase,
  status: string,
): Promise<number> {
  const result = await executeRaw(
    disposable.client.db,
    sql`
    SELECT count(*)::int AS total FROM outbox_events WHERE status = ${status}
  `,
  );
  return Number(rowsOf(result)[0]?.['total'] ?? 0);
}

/**
 * Polls a condition to a deadline.
 *
 * The worker is genuinely asynchronous, so the alternative is a fixed sleep
 * long enough for the slowest machine — which is both slower and flakier than
 * checking the real state.
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 20_000,
  label = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const { rows } = result as { rows?: unknown };
    if (Array.isArray(rows)) {
      return rows as Record<string, unknown>[];
    }
  }
  return [];
}
