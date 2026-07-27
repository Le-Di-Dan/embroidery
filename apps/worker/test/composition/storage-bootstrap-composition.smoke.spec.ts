/**
 * APP2-I03 §14 — API and worker bootstrapping the same empty store at once.
 *
 * The single-process smokes prove each side in isolation. This one proves the
 * thing isolation cannot: two independent processes, started deliberately close
 * together, racing `CreateBucket` for the same two names against one MinIO. A
 * lost race must be a success for the loser (the bucket it wanted now exists
 * and is theirs), never a failed start and never a second bucket.
 *
 * Both processes are the real built entry points — `apps/api/dist/main.js` and
 * `apps/worker/dist/main.js` — so the composition under test is the production
 * one, not a graph assembled by a test.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import {
  TEST_ACCESS_KEY_ID,
  TEST_SECRET_ACCESS_KEY,
  containerExists,
  listBucketDirectories,
  minioEnv,
  startDisposableMinio,
  type DisposableMinio,
} from '../support/disposable-minio';
import { seedWorkerPolicy } from '../../src/runtime/tests/worker-runtime-context';

const WORKER_ROOT = path.resolve(__dirname, '..', '..');
const API_ROOT = path.resolve(WORKER_ROOT, '..', 'api');
const WORKER_MAIN = path.join(WORKER_ROOT, 'dist', 'main.js');
const API_MAIN = path.join(API_ROOT, 'dist', 'main.js');

const READY_BUDGET_MS = 60_000;
const SHUTDOWN_BUDGET_MS = 30_000;

interface Termination {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface RunningProcess {
  readonly child: ChildProcess;
  readonly output: () => string;
  stop: (signal: NodeJS.Signals) => Promise<Termination>;
}

/**
 * True when the process ended without reporting a failure.
 *
 * Windows has no real SIGTERM: `child.kill('SIGTERM')` there calls
 * `TerminateProcess`, so the child dies *by signal* with a null exit code and
 * never runs Nest's shutdown hooks. That platform limitation is already
 * recorded by APP2-I02/C1, whose real-SIGTERM exit-0 proof runs the shipped
 * image in a Linux container (`test:worker-runtime:signal-smoke`). This suite
 * proves the bootstrap composition, so it accepts either termination shape and
 * fails loudly on a non-zero exit — which is what a failed startup looks like.
 */
function terminatedCleanly(result: Termination): boolean {
  return result.code === 0 || (result.code === null && result.signal !== null);
}

function start(
  name: string,
  main: string,
  cwd: string,
  env: Record<string, string>,
): RunningProcess {
  const child = spawn(process.execPath, [main], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  return {
    child,
    output: () => output,
    stop: (signal: NodeJS.Signals) =>
      new Promise<Termination>((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve({ code: child.exitCode, signal: child.signalCode });
          return;
        }
        const kill = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`${name} did not exit within ${String(SHUTDOWN_BUDGET_MS)}ms.`));
        }, SHUTDOWN_BUDGET_MS);
        child.once('exit', (code, exitSignal) => {
          clearTimeout(kill);
          resolve({ code, signal: exitSignal });
        });
        child.kill(signal);
      }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await delay(200);
  }
  throw new Error(`Timed out after ${String(timeoutMs)}ms waiting for ${what}.`);
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a loopback port for the API.'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

describe('API and worker private-bucket bootstrap (cross-process)', () => {
  let disposable: DisposableDatabase;
  let minio: DisposableMinio;
  let apiPort: number;
  let api: RunningProcess;
  let worker: RunningProcess;
  let bucketsBefore: string[];
  let bucketsAfter: string[];
  let apiExit: Termination;
  let workerExit: Termination;

  beforeAll(async () => {
    for (const [label, main] of [
      ['api', API_MAIN],
      ['worker', WORKER_MAIN],
    ] as const) {
      if (!existsSync(main)) {
        throw new Error(`The ${label} is not built. Run its \`build\` script first (${main}).`);
      }
    }

    disposable = await createDisposableDatabase('i03-composition');
    await seedWorkerPolicy(disposable);
    minio = await startDisposableMinio();
    bucketsBefore = await listBucketDirectories(minio.containerName);
    apiPort = await reserveLoopbackPort();

    const shared = {
      NODE_ENV: 'test',
      DATABASE_URL: disposable.url,
      DATABASE_SSL_MODE: 'disable',
      ...minioEnv(minio),
    };

    // Started back-to-back with no wait between them: both reach
    // `ensurePrivateBuckets` while the store is still empty, which is the race
    // this test exists for.
    api = start('api', API_MAIN, API_ROOT, {
      ...shared,
      API_PORT: String(apiPort),
      API_DOCS_ENABLED: 'false',
    });
    worker = start('worker', WORKER_MAIN, WORKER_ROOT, shared);

    await waitFor(
      () => api.output().includes('API listening on port'),
      READY_BUDGET_MS,
      'the API to listen',
    );
    await waitFor(
      () => worker.output().includes('Worker readiness:'),
      READY_BUDGET_MS,
      'the worker to report readiness',
    );

    bucketsAfter = await listBucketDirectories(minio.containerName);

    apiExit = await api.stop('SIGTERM');
    workerExit = await worker.stop('SIGTERM');
  }, 300_000);

  afterAll(async () => {
    await api?.stop('SIGKILL').catch(() => null);
    await worker?.stop('SIGKILL').catch(() => null);
    await minio?.stop();
    await disposable?.drop();
  });

  it('starts from an empty store', () => {
    expect(bucketsBefore).toEqual([]);
  });

  it('brings both processes up', () => {
    expect(api.output()).toContain('API listening on port');
    expect(worker.output()).toContain('Worker readiness: ready (ok)');
  });

  it('has both processes verify the buckets', () => {
    expect(api.output()).toContain('Private object-storage buckets verified (component=api)');
    expect(worker.output()).toContain('Private object-storage buckets verified (component=worker)');
  });

  it('creates exactly two buckets despite the concurrent bootstrap', () => {
    expect(bucketsAfter).toEqual([minio.derivativesBucket, minio.originalsBucket].sort());
  });

  it('adds no bucket policy or public access', async () => {
    // The bootstrap calls no policy API at all, so an anonymous list must still
    // be refused after two processes have raced to create the same buckets.
    const listing = await fetch(`${minio.endpoint}/${minio.originalsBucket}/`);
    const root = await fetch(`${minio.endpoint}/`);
    expect(listing.ok).toBe(false);
    expect(root.ok).toBe(false);
  });

  it('reports the API listening only after its bootstrap line', () => {
    // Ordering read from the process's own output: the guarantee is "buckets
    // before the port", and this is where that is observable end to end.
    const output = api.output();
    const verified = output.indexOf('Private object-storage buckets verified');
    const listening = output.indexOf('API listening on port');
    expect(verified).toBeGreaterThanOrEqual(0);
    expect(listening).toBeGreaterThan(verified);
  });

  it('claims nothing while idle', () => {
    expect(worker.output()).toContain('0 handler(s) registered');
  });

  it('shuts both processes down cleanly', () => {
    expect(terminatedCleanly(apiExit)).toBe(true);
    expect(terminatedCleanly(workerExit)).toBe(true);
    expect(apiExit.code).not.toBe(1);
    expect(workerExit.code).not.toBe(1);
  });

  it('is idempotent on restart', async () => {
    const shared = {
      NODE_ENV: 'test',
      DATABASE_URL: disposable.url,
      DATABASE_SSL_MODE: 'disable',
      ...minioEnv(minio),
    };
    const restarted = start('worker', WORKER_MAIN, WORKER_ROOT, shared);
    await waitFor(
      () => restarted.output().includes('Worker readiness:'),
      READY_BUDGET_MS,
      'the restarted worker to report readiness',
    );
    const exit = await restarted.stop('SIGTERM');

    expect(restarted.output()).toContain('Worker readiness: ready (ok)');
    expect(terminatedCleanly(exit)).toBe(true);
    await expect(listBucketDirectories(minio.containerName)).resolves.toEqual(bucketsAfter);
  });

  it('leaks no credential into either process output', () => {
    const combined = `${api.output()}${worker.output()}`;
    expect(combined).not.toContain(TEST_SECRET_ACCESS_KEY);
    expect(combined).not.toContain(TEST_ACCESS_KEY_ID);
  });

  it('leaves zero residue', async () => {
    await minio.stop();
    await disposable.drop();
    await expect(containerExists(minio.containerName)).resolves.toBe(false);
  });
});
