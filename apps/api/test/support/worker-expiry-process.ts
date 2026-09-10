/**
 * The real Ready-Made expiry sweep, as a second OS process (`APP12-B03-C1` §4).
 *
 * `apps/api` may not import `apps/worker`, so the only way to race the delivered
 * Admin shipping write against the delivered
 * `ExpireReadyMadeReservationsUseCase` is the way production already runs them:
 * two processes, one database. This spawns the worker-owned
 * `expiry-pass-child.mjs` over the built worker `dist`, points it at the
 * caller's **disposable** database, and drives one real pass per instruction.
 *
 * `APP12-B03` substituted a hand-written `UPDATE inventory_reservations` for
 * this, which expired a reservation without cancelling its order — the invalid
 * final state B03-C1 exists to remove. Nothing here reimplements any part of
 * the sweep: the child runs the shipped use case, through the shipped
 * persistence writers, in the shipped transaction.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline';

import { sql } from 'drizzle-orm';

import type { ApiIntegrationTestContext } from './api-integration-context';

const WORKER_ROOT = path.resolve(__dirname, '..', '..', '..', 'worker');
const WORKER_DIST = path.join(WORKER_ROOT, 'dist');
const CHILD_PATH = path.join(WORKER_ROOT, 'test', 'support', 'expiry-pass-child.mjs');
const BOOT_BUDGET_MS = 120_000;

/**
 * Valid but unroutable. `WorkerModule` composes the object-storage bootstrap,
 * so the configuration has to resolve; the expiry sweep contacts no store, and
 * the startup gate that would is overridden closed inside the child.
 */
const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app12-b03-c1-expiry.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app12-b03-c1',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app12-b03-c1',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app12-b03-c1-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app12-b03-c1-derivatives',
};

/**
 * The transport this child composes under (`APP12-E01` §25, harness fix).
 *
 * `APP12-N01.B01` removed `NotificationDeliveryModule`'s wiring default — a
 * default is how the U01 blocker reached a deployment — so composing
 * `WorkerModule` now *requires* the variable to be stated. Nothing on the API
 * side ever stated it, so every API suite that spawns this child has failed at
 * boot since N01 landed: the child died before printing `READY` and the parent
 * reported only "said nothing within 120000ms".
 *
 * `RECORDING` is the honest answer, for the same reason the worker's own setup
 * file gives: this child exists to run the reservation-expiry sweep, it sends
 * nothing, and naming a real SMTP transport would invent a dependency the sweep
 * does not have. `??=` semantics are kept by letting an outer value win.
 */
const NOTIFICATION_TRANSPORT = process.env['NOTIFICATION_TRANSPORT'] ?? 'RECORDING';

/** What one real pass reported. */
export interface ExpiryPassOutcome {
  readonly examined: number;
  readonly expired: number;
  readonly skipped: number;
}

export interface WorkerExpiryProcess {
  /** Runs one real sweep pass and resolves with its outcome. */
  runPass(): Promise<ExpiryPassOutcome>;
  /** Everything the child wrote, for a failure that needs explaining. */
  readonly transcript: () => string;
  close(): Promise<void>;
}

/**
 * Boots the child and waits until it is warm.
 *
 * Warm before the first race on purpose: a Nest boot takes seconds, and an
 * actor that has to boot first is not racing, it is losing.
 */
export async function startWorkerExpiryProcess(
  context: ApiIntegrationTestContext,
): Promise<WorkerExpiryProcess> {
  if (!existsSync(path.join(WORKER_DIST, 'main.js'))) {
    throw new Error(
      `The worker is not built. Run \`pnpm --filter @embroidery/worker build\` first (${WORKER_DIST}).`,
    );
  }

  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CHILD_PATH, WORKER_DIST], {
    cwd: WORKER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: context.database.url,
      DATABASE_SSL_MODE: 'disable',
      NOTIFICATION_TRANSPORT,
      ...OFFLINE_STORAGE_ENV,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let transcript = '';
  child.stderr.on('data', (chunk: Buffer) => {
    transcript += chunk.toString();
  });

  const lines: Interface = createInterface({ input: child.stdout });
  // One queue of waiters, because the protocol is strictly one instruction at a
  // time: the parent never writes a second `GO` before the first `PASS`.
  const waiting: Array<(line: string) => void> = [];
  lines.on('line', (line: string) => {
    transcript += `${line}\n`;
    waiting.shift()?.(line);
  });

  const nextLine = (budgetMs: number): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`The expiry child said nothing within ${String(budgetMs)}ms:\n${transcript}`),
        );
      }, budgetMs);
      waiting.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });

  const ready = await nextLine(BOOT_BUDGET_MS);
  if (ready !== 'READY') {
    child.kill('SIGKILL');
    throw new Error(`The expiry child failed to boot:\n${transcript}`);
  }

  return {
    async runPass(): Promise<ExpiryPassOutcome> {
      const answer = nextLine(BOOT_BUDGET_MS);
      child.stdin.write('GO\n');
      const line = await answer;
      if (!line.startsWith('PASS ')) {
        throw new Error(`The expiry pass failed: ${line}`);
      }
      return JSON.parse(line.slice('PASS '.length)) as ExpiryPassOutcome;
    },
    transcript: () => transcript,
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.stdin.write('BYE\n');
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 15_000).unref();
      });
    },
  };
}

/**
 * Waits until some session on this database is blocked on a row lock.
 *
 * The stale-candidate case (§7) needs the sweep to have *already listed* its
 * candidates before the Admin write commits. Holding one candidate's `orders`
 * row is what pins the pass open long enough for that to be true, and this is
 * how the harness knows the pass has actually arrived at that lock rather than
 * guessing with a sleep.
 */
export async function waitForBlockedSession(
  context: ApiIntegrationTestContext,
  budgetMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const { rows } = await context.database.client.db.execute<{ count: string }>(sql`
      select count(*)::text as count from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock'
    `);
    if (Number(rows[0]?.count ?? '0') > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    'No session ever blocked on a lock; the expiry pass never reached its candidate.',
  );
}
