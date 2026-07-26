/**
 * APP2-I02 §17 "Real worker smoke".
 *
 * Runs the built `dist/main.js` as its own OS process against a disposable
 * database. This is the only test that exercises the real entry point: the Nest
 * standalone context, `enableShutdownHooks`, the readiness log and the process
 * exit. Everything else in the suite runs inside Jest, where none of that is
 * real.
 *
 * The persistent development database is never touched: the child only ever
 * receives the disposable database's URL.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { outboxState, seedDueEvent, seedWorkerPolicy } from './tests/worker-runtime-context';

const WORKER_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(WORKER_ROOT, 'dist', 'main.js');
const CHILD_PATH = path.join(WORKER_ROOT, 'src', 'runtime', 'tests', 'worker-smoke-child.mjs');
const SHUTDOWN_BUDGET_MS = 15_000;

interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
}

function runWorker(databaseUrl: string): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [CHILD_PATH, MAIN_PATH, '2500'], {
      cwd: WORKER_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        DATABASE_SSL_MODE: 'disable',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
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
      reject(new Error(`Worker did not exit within ${String(SHUTDOWN_BUDGET_MS)}ms.`));
    }, SHUTDOWN_BUDGET_MS);

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(kill);
      resolve({ code, signal, stdout, stderr, elapsedMs: Date.now() - startedAt });
    });
  });
}

describe('worker smoke (real process)', () => {
  let disposable: DisposableDatabase;
  let result: ChildResult;
  let eventId: bigint;

  beforeAll(async () => {
    if (!existsSync(MAIN_PATH)) {
      throw new Error(
        `The worker is not built. Run \`pnpm --filter @embroidery/worker build\` first (${MAIN_PATH}).`,
      );
    }
    disposable = await createDisposableDatabase('i02-smoke');
    await seedWorkerPolicy(disposable);
    // A due event the production registry cannot handle. An idle worker must
    // leave it exactly as it found it.
    eventId = await seedDueEvent(disposable);

    result = await runWorker(disposable.url);
  }, 180_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  it('boots the real process and reports itself ready', () => {
    expect(result.stdout).toContain('SMOKE_BOOTED');
    expect(result.stdout).toContain('Worker readiness: ready (ok)');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('is idle with the empty production registry', () => {
    // I02 registers no handler, so the runtime must say so rather than claim.
    expect(result.stdout).toContain('0 handler(s) registered');
  });

  it('steals no event it cannot handle', async () => {
    const state = await outboxState(disposable, eventId);

    expect(state.status).toBe('PENDING');
    expect(state.attemptCount).toBe(0);
    expect(state.claimedBy).toBeNull();
  });

  it('stops claiming and closes the context on SIGTERM', () => {
    expect(result.stdout).toContain('Poll loop stopped claiming.');
    expect(result.stdout).toContain('Worker runtime stopped (SIGTERM)');
  });

  it('exits promptly rather than hanging on an open handle', () => {
    // Nest re-raises the signal after its shutdown hooks complete, so the exit
    // is by signal (POSIX) or code 1 (Windows, which has no real SIGTERM).
    // What matters here is that it happened well inside the budget instead of
    // waiting on a live timer or an unclosed pool.
    expect(result.elapsedMs).toBeLessThan(SHUTDOWN_BUDGET_MS);
    expect(result.stdout).not.toContain('did not finish within the shutdown grace period');
  });

  it('leaks no handle across many poll cycles', () => {
    const early = resourcesFrom('SMOKE_RESOURCES_EARLY');
    const late = resourcesFrom('SMOKE_RESOURCES_LATE');

    expect(early.length).toBeGreaterThan(0);
    // Dozens of poll cycles separate the two samples. An un-cleared timeout or
    // an unreleased connection per cycle would show up as growth here; a single
    // snapshot could not distinguish a leak from the runtime's normal state.
    expect(countKinds(late)).toEqual(countKinds(early));
  });

  function resourcesFrom(marker: string): string[] {
    const line = new RegExp(`${marker} (.+)`).exec(result.stdout)?.[1] ?? '[]';
    return JSON.parse(line) as string[];
  }

  /**
   * Counts runtime-owned handles.
   *
   * `PipeWrap` is excluded: those are the child's own stdout/stderr pipes,
   * created lazily by the very logging this test reads. They are an artifact of
   * observing the process, not something the worker runtime holds.
   */
  function countKinds(resources: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const kind of resources) {
      if (kind === 'PipeWrap') {
        continue;
      }
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  }
});
