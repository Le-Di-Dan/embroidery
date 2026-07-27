/**
 * APP2-I02-FD1 — uncooperative timeout recovery across a real Linux process
 * boundary.
 *
 * Why this exists: the C1 evidence injected a process-exit seam, so worker A's
 * never-settling promise stayed alive inside the Jest process and worker B
 * started after an exit *record*, not after worker A had actually died. That
 * ordering could not rule out overlap. Here worker A really terminates —
 * `docker inspect` reports `Running: false`, `ExitCode: 1` and a `FinishedAt`
 * — before worker B is started at all.
 *
 * Everything is disposable: one database, two containers, one image, all
 * removed and their absence asserted.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import {
  containerEnvArgs,
  startDisposableMinio,
  type DisposableMinio,
} from '../support/disposable-minio';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const IMAGE_TAG = 'embroidery-fd1-worker:test';
const PROCESS_TEST_EVENT = 'test.worker.uncooperative-timeout';
const WORKER_B_COMMAND = 'dist-process-test/test/process/fixtures/recovery-worker.fixture.js';

/**
 * Handler timeout 1 s and safety margin 2 s put the hard stop ~3 s after the
 * claim; a 20 s lease leaves ~17 s of slack to observe a real termination
 * strictly before expiry without making the suite slow.
 */
const POLICY = {
  concurrency: 1,
  batchSize: 1,
  pollIntervalMs: 250,
  leaseDurationMs: 20_000,
  handlerTimeoutMs: 1_000,
  leaseSafetyMarginMs: 2_000,
  shutdownGraceMs: 1_000,
  maxAttempts: 3,
  backoffBaseMs: 100,
  backoffMaxMs: 1_000,
};

interface Command {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], timeoutMs = 900_000): Promise<Command> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const kill = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`\`${command} ${args.join(' ')}\` exceeded ${String(timeoutMs)}ms.`));
    }, timeoutMs);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(kill);
      resolve({ code, stdout, stderr });
    });
  });
}

async function docker(args: readonly string[], timeoutMs?: number): Promise<Command> {
  const result = await run('docker', args, timeoutMs);
  if (result.code !== 0) {
    throw new Error(`docker ${args[0] ?? ''} failed (${String(result.code)}): ${result.stderr}`);
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Container output, **both streams**.
 *
 * Nest's `Logger.error` writes to stderr, so reading only stdout would silently
 * miss the one line that proves the fatal path ran.
 */
async function containerLogs(name: string): Promise<string> {
  const result = await run('docker', ['logs', name]);
  return `${result.stdout}\n${result.stderr}`;
}

interface ContainerState {
  readonly running: boolean;
  readonly exitCode: number;
  readonly finishedAt: Date;
}

async function inspectState(name: string): Promise<ContainerState> {
  const result = await docker([
    'inspect',
    '--format',
    '{{.State.Running}}|{{.State.ExitCode}}|{{.State.FinishedAt}}',
    name,
  ]);
  const [running, exitCode, finishedAt] = result.stdout.trim().split('|');
  return {
    running: running === 'true',
    exitCode: Number(exitCode),
    finishedAt: new Date(String(finishedAt)),
  };
}

interface OutboxSnapshot {
  readonly status: string;
  readonly attemptCount: number;
  readonly claimedBy: string | null;
  readonly nextAttemptAt: Date;
  readonly lastError: string | null;
}

interface ProbeRow {
  readonly workerRole: string;
  readonly workerId: string;
  readonly eventName: string;
  readonly recordedAt: Date;
}

interface AttemptRow {
  readonly attemptNo: number;
  readonly outcome: string;
  readonly errorClass: string | null;
}

describe('worker fatal timeout — real Linux process isolation', () => {
  const runId = randomUUID().slice(0, 8);
  const workerAName = `embroidery-fd1-a-${runId}`;
  const workerBName = `embroidery-fd1-b-${runId}`;

  let disposable: DisposableDatabase;
  let minio: DisposableMinio;
  let containerUrl: string;
  let eventId: bigint;

  let workerAState: ContainerState;
  let workerBExit = Number.NaN;
  let leaseDeadline: Date;
  let heldSnapshot: OutboxSnapshot;
  let attemptsBeforeReclaim: AttemptRow[] = [];
  let finalSnapshot: OutboxSnapshot;
  let finalAttempts: AttemptRow[] = [];
  let probes: ProbeRow[] = [];
  let workerARunningDuringB = true;

  async function snapshot(): Promise<OutboxSnapshot> {
    const rows = await executeRaw<{
      status: string;
      attempt_count: number;
      claimed_by: string | null;
      next_attempt_at: Date;
      last_error: string | null;
    }>(
      disposable.client.db,
      sql`SELECT status, attempt_count, claimed_by, next_attempt_at, last_error
          FROM outbox_events WHERE id = ${eventId}`,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('The target outbox row disappeared.');
    }
    return {
      status: row.status,
      attemptCount: Number(row.attempt_count),
      claimedBy: row.claimed_by,
      nextAttemptAt:
        row.next_attempt_at instanceof Date
          ? row.next_attempt_at
          : new Date(String(row.next_attempt_at)),
      lastError: row.last_error,
    };
  }

  async function attempts(): Promise<AttemptRow[]> {
    const rows = await executeRaw<{
      attempt_no: number;
      outcome: string;
      error_class: string | null;
    }>(
      disposable.client.db,
      sql`SELECT attempt_no, outcome, error_class FROM background_job_attempts
          WHERE job_key = ${eventId.toString()} ORDER BY attempt_no, id`,
    );
    return rows.map((row) => ({
      attemptNo: Number(row.attempt_no),
      outcome: row.outcome,
      errorClass: row.error_class,
    }));
  }

  async function readProbes(): Promise<ProbeRow[]> {
    const rows = await executeRaw<{
      worker_role: string;
      worker_id: string;
      event_name: string;
      recorded_at: Date;
    }>(
      disposable.client.db,
      sql`SELECT worker_role, worker_id, event_name, recorded_at
          FROM worker_runtime_process_probe ORDER BY recorded_at, id`,
    );
    return rows.map((row) => ({
      workerRole: row.worker_role,
      workerId: row.worker_id,
      eventName: row.event_name,
      recordedAt:
        row.recorded_at instanceof Date ? row.recorded_at : new Date(String(row.recorded_at)),
    }));
  }

  /** The database's own clock — never the host's — for lease comparisons. */
  async function databaseNow(): Promise<Date> {
    const rows = await executeRaw<{ now: Date }>(
      disposable.client.db,
      sql`SELECT clock_timestamp() AS now`,
    );
    const value = rows[0]?.now;
    return value instanceof Date ? value : new Date(String(value));
  }

  async function waitFor(
    predicate: () => Promise<boolean>,
    timeoutMs: number,
    label: string,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) {
        return;
      }
      await delay(200);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  }

  beforeAll(async () => {
    await docker(['version', '--format', '{{.Server.Version}}'], 60_000);
    await docker([
      'build',
      '--file',
      'infrastructure/docker/worker.Dockerfile',
      '--target',
      'process-test',
      '--tag',
      IMAGE_TAG,
      '.',
    ]);

    disposable = await createDisposableDatabase('fd1-fatal-process');
    // Both containers run the shipped worker, which verifies its private
    // buckets before claiming anything (APP2-I03). Reached over
    // `host.docker.internal`, exactly like the disposable database.
    minio = await startDisposableMinio();

    // The probe table is test setup inside the disposable database only — not a
    // migration, and never part of the 31-migration canonical schema.
    await executeRaw(
      disposable.client.db,
      sql`CREATE TABLE worker_runtime_process_probe (
            id           bigserial PRIMARY KEY,
            job_key      text NOT NULL,
            worker_role  text NOT NULL,
            worker_id    text NOT NULL,
            event_name   text NOT NULL,
            recorded_at  timestamptz NOT NULL DEFAULT clock_timestamp()
          )`,
    );

    const adminId = newId();
    await executeRaw(
      disposable.client.db,
      sql`INSERT INTO admin_accounts (id, email, display_name, status)
          VALUES (${adminId}, ${`fd1-${adminId}@example.com`}, 'FD1 Fixture', 'ACTIVE')`,
    );
    const configId = newId();
    const versionId = newId();
    await executeRaw(
      disposable.client.db,
      sql`INSERT INTO policy_configurations (id, config_key, description)
          VALUES (${configId}, 'worker.runtime', 'FD1 process-proof policy.')`,
    );
    await executeRaw(
      disposable.client.db,
      sql`INSERT INTO policy_configuration_versions
            (id, policy_configuration_id, version, value, value_schema_version,
             effective_from, created_by_admin_id, reason)
          VALUES (${versionId}, ${configId}, 1, ${JSON.stringify(POLICY)}::jsonb, 1,
                  clock_timestamp(), ${adminId}, 'FD1 process-proof policy.')`,
    );
    await executeRaw(
      disposable.client.db,
      sql`UPDATE policy_configurations SET current_version_id = ${versionId} WHERE id = ${configId}`,
    );

    const seeded = await executeRaw<{ id: string }>(
      disposable.client.db,
      sql`INSERT INTO outbox_events
            (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
             status, attempt_count, next_attempt_at)
          VALUES (${PROCESS_TEST_EVENT}, 'CUSTOM_REQUEST', ${newId()},
                  ${JSON.stringify({ marker: 'fd1' })}::jsonb, 1, 'PENDING', 0, NULL)
          RETURNING id`,
    );
    eventId = BigInt(String(seeded[0]?.id));

    const url = new URL(disposable.url);
    url.hostname = 'host.docker.internal';
    containerUrl = url.toString();

    // ---- Worker A: the real uncooperative process -------------------------
    await docker([
      'run',
      '--detach',
      '--name',
      workerAName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '--env',
      `DATABASE_URL=${containerUrl}`,
      '--env',
      'DATABASE_SSL_MODE=disable',
      '--env',
      'NODE_ENV=development',
      ...containerEnvArgs(minio),
      IMAGE_TAG,
    ]);

    await waitFor(
      async () => (await snapshot()).claimedBy !== null,
      90_000,
      'worker A to claim the event',
    );
    const claimed = await snapshot();
    leaseDeadline = claimed.nextAttemptAt;

    // Worker A must die on its own — no signal, no kill, no injected seam.
    await waitFor(
      async () => !(await inspectState(workerAName)).running,
      90_000,
      'worker A to terminate by itself',
    );
    workerAState = await inspectState(workerAName);

    heldSnapshot = await snapshot();
    attemptsBeforeReclaim = await attempts();

    // Nothing may touch the row until the lease expires, by the database clock.
    await waitFor(
      async () => (await databaseNow()).getTime() > leaseDeadline.getTime(),
      120_000,
      'the lease to expire',
    );

    // ---- Worker B: recovery, started only now -----------------------------
    workerARunningDuringB = (await inspectState(workerAName)).running;
    await docker([
      'run',
      '--detach',
      '--name',
      workerBName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '--env',
      `DATABASE_URL=${containerUrl}`,
      '--env',
      'DATABASE_SSL_MODE=disable',
      '--env',
      'NODE_ENV=development',
      ...containerEnvArgs(minio),
      IMAGE_TAG,
      'node',
      WORKER_B_COMMAND,
    ]);

    const waited = await run('docker', ['wait', workerBName], 180_000);
    workerBExit = Number(waited.stdout.trim());

    finalSnapshot = await snapshot();
    finalAttempts = await attempts();
    probes = await readProbes();

    // Printed because these are the checkpoint's acceptance numbers: a reviewer
    // should see the real exit code, termination instant and lease deadline
    // rather than only a green assertion.
    const handlerB = probes.find(
      (probe) => probe.workerRole === 'WORKER_B' && probe.eventName === 'HANDLER_STARTED',
    );
    console.log(
      [
        '[fd1] workerA.exitCode=' + String(workerAState.exitCode),
        'workerA.running=' + String(workerAState.running),
        'workerA.finishedAt=' + workerAState.finishedAt.toISOString(),
        'leaseDeadline=' + leaseDeadline.toISOString(),
        'marginMs=' + String(leaseDeadline.getTime() - workerAState.finishedAt.getTime()),
        'workerB.handlerStartedAt=' + (handlerB?.recordedAt.toISOString() ?? 'none'),
        'workerB.exitCode=' + String(workerBExit),
        'attemptsBeforeReclaim=' + String(attemptsBeforeReclaim.length),
        'finalStatus=' + finalSnapshot.status,
        'finalAttemptCount=' + String(finalSnapshot.attemptCount),
      ].join(' '),
    );
  }, 1_800_000);

  afterAll(async () => {
    for (const name of [workerAName, workerBName]) {
      await run('docker', ['rm', '--force', '--volumes', name], 60_000);
    }
    await run('docker', ['image', 'rm', '--force', IMAGE_TAG], 180_000);
    await minio?.stop();
    await disposable?.drop();
  });

  describe('worker A — real fatal termination', () => {
    it('became ready, claimed the event and ran the handler', () => {
      const workerA = probes.filter((probe) => probe.workerRole === 'WORKER_A');
      const events = workerA.map((probe) => probe.eventName);

      expect(events).toContain('PROCESS_START');
      expect(events).toContain('PROCESS_READY');
      expect(events).toContain('HANDLER_STARTED');
      expect(heldSnapshot.attemptCount).toBe(1);
    });

    it('logged the timeout and entered the fatal state', async () => {
      const logs = await containerLogs(workerAName);

      // The single allow-list fatal line, emitted before anything is awaited.
      expect(logs).toContain('"outcome":"FATAL_HANDLER_UNRESPONSIVE"');
      expect(logs).toContain('"jobKind":"OUTBOX_DISPATCH"');
      // And the transition recorded from inside the fatal closer, which the
      // fatal path awaits before exiting.
      expect(probes.map((probe) => probe.eventName)).toContain('FATAL_STATE_ENTERED');
    });

    it('leaked no payload, secret or stack trace into its logs', async () => {
      const logs = await containerLogs(workerAName);

      expect(logs).not.toContain('marker');
      expect(logs).not.toContain('password');
      expect(logs).not.toContain('    at ');
    });

    it('actually terminated in Linux with exit code 1', () => {
      // Not a recorded exit — the container is gone.
      expect(workerAState.running).toBe(false);
      expect(workerAState.exitCode).toBe(1);
    });

    it('finished strictly before the database lease deadline', () => {
      expect(workerAState.finishedAt.getTime()).toBeLessThan(leaseDeadline.getTime());
    });
  });

  describe('lease preservation', () => {
    it('left the row exactly as worker A claimed it', () => {
      const workerAId = probes.find(
        (probe) => probe.workerRole === 'WORKER_A' && probe.eventName === 'HANDLER_STARTED',
      )?.workerId;

      expect(heldSnapshot.status).toBe('PENDING');
      expect(heldSnapshot.claimedBy).toBe(workerAId);
      expect(heldSnapshot.attemptCount).toBe(1);
      expect(heldSnapshot.nextAttemptAt.getTime()).toBe(leaseDeadline.getTime());
      expect(heldSnapshot.lastError).toBeNull();
    });

    it('wrote no attempt row before the reclaim', () => {
      expect(attemptsBeforeReclaim).toEqual([]);
    });
  });

  describe('worker B — recovery', () => {
    it('started only after worker A had terminated', () => {
      expect(workerARunningDuringB).toBe(false);
    });

    it('reclaimed the event, advanced the attempt and dispatched it', () => {
      expect(finalSnapshot.status).toBe('DISPATCHED');
      expect(finalSnapshot.attemptCount).toBe(2);
    });

    it('recorded exactly one lease-expiry attempt and one success', () => {
      expect(finalAttempts).toEqual([
        { attemptNo: 1, outcome: 'FAILED_RETRYABLE', errorClass: 'WORKER_LEASE_EXPIRED' },
        { attemptNo: 2, outcome: 'SUCCEEDED', errorClass: null },
      ]);
    });

    it('exited cleanly', () => {
      expect(workerBExit).toBe(0);
      expect(probes.map((probe) => probe.eventName)).toContain('PROCESS_STOPPING');
    });
  });

  describe('definitive no-overlap proof', () => {
    it("started worker B's handler strictly after worker A's container finished", () => {
      const started = probes.filter(
        (probe) => probe.workerRole === 'WORKER_B' && probe.eventName === 'HANDLER_STARTED',
      );

      expect(started).toHaveLength(1);
      // Worker A's process no longer existed at this instant, so its runaway
      // handler could not have been running alongside this one. This is the
      // step the in-process C1 evidence could not take.
      expect(started[0]?.recordedAt.getTime()).toBeGreaterThan(workerAState.finishedAt.getTime());
    });

    it('ran the handler exactly once per worker, by distinct worker ids', () => {
      const handlerStarts = probes.filter((probe) => probe.eventName === 'HANDLER_STARTED');
      const ids = new Set(handlerStarts.map((probe) => probe.workerId));

      expect(handlerStarts.map((probe) => probe.workerRole)).toEqual(['WORKER_A', 'WORKER_B']);
      expect(ids.size).toBe(2);
    });

    it('produced no duplicate lease-expiry attempt and no third attempt', () => {
      const expiries = finalAttempts.filter((row) => row.errorClass === 'WORKER_LEASE_EXPIRED');

      expect(expiries).toHaveLength(1);
      expect(finalAttempts).toHaveLength(2);
    });

    it('never let worker A claim or execute a second time', async () => {
      const logs = await containerLogs(workerAName);
      const workerAStarts = probes.filter(
        (probe) => probe.workerRole === 'WORKER_A' && probe.eventName === 'HANDLER_STARTED',
      );

      // One process, one runtime, one execution — and `attempt_count` never
      // moved past 1 while worker A held the row.
      expect(logs.split('Worker runtime started').length - 1).toBe(1);
      expect(workerAStarts).toHaveLength(1);
      expect(heldSnapshot.attemptCount).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('removes both containers, the image and the disposable database', async () => {
      for (const name of [workerAName, workerBName]) {
        await run('docker', ['rm', '--force', '--volumes', name], 60_000);
      }
      await run('docker', ['image', 'rm', '--force', IMAGE_TAG], 180_000);

      const containers = await docker([
        'ps',
        '--all',
        '--quiet',
        '--filter',
        `name=embroidery-fd1-`,
      ]);
      const images = await docker(['images', '--quiet', IMAGE_TAG]);
      expect(containers.stdout.trim()).toBe('');
      expect(images.stdout.trim()).toBe('');

      const name = disposable.name;
      await disposable.drop();
      // Proved by asking the server, on a connection that outlives the drop.
      const probe = await createDisposableDatabase('fd1-residue-probe');
      try {
        const rows = await executeRaw<{ found: number }>(
          probe.client.db,
          sql`SELECT 1 AS found FROM pg_database WHERE datname = ${name}`,
        );
        expect(rows).toHaveLength(0);
      } finally {
        await probe.drop();
      }
    }, 300_000);
  });
});
