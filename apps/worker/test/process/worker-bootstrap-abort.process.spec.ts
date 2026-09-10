/**
 * `APP12-E01` §18 — the half-started worker, proved at the process boundary
 * (`FU-APP12-H07-03`).
 *
 * The defect was never observable inside Jest. `NestFactory.createApplicationContext`
 * runs every `onApplicationBootstrap` hook, and three of them start work that
 * holds the event loop open: the job poll loop, the intake-cleanup sweep and
 * the Ready-Made reservation-expiry sweep. A throw *after* that point — the
 * metrics listener, the readiness probe, a late hook — used to log one line and
 * set `process.exitCode = 1`. Nothing read that code, because nothing ever
 * reached the end of the event loop: the process stayed alive, polling, with no
 * metrics listener bound and no failing probe. On the cluster it showed as
 * `Running 1/1`, `0` restarts, and an operator's `rollout restart` as the only
 * recovery.
 *
 * So the only faithful test is a real OS process, and the only faithful failure
 * is one that fires in that exact window. `METRICS_PORT=0` is such a failure and
 * is not test-only plumbing: `resolveMetricsPort` rejects it before
 * `bootstrapMetricsListener` opens its own `try`, so it throws out of the one
 * step that runs after every bootstrap hook and before readiness is ever
 * reported. A real operator can make exactly this mistake.
 *
 * The invariant under test is `APP12-E01` §3.2's: a bootstrap failure before
 * readiness ends the process deterministically. Not "logs". Not "sets a code".
 * Exits.
 *
 * Runs from its own indexed command (`CMD-TEST-APP12-E01-WORKER-BOOTSTRAP`): it
 * needs `dist/` and a disposable PostgreSQL, so the Docker-free `pnpm test`
 * excludes every `*.process.spec.ts`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { seedWorkerPolicy } from '../../src/runtime/tests/worker-runtime-context';

const WORKER_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(WORKER_ROOT, 'dist', 'main.js');

/**
 * How long the process is given to end itself.
 *
 * Generous against the 5s abort budget `main.ts` reserves for the close, and
 * still far inside "forever", which is what the defect actually produced. A
 * failure here is reported as the defect, not as a slow machine: the suite kills
 * the child and says the process was still alive.
 */
const EXIT_BUDGET_MS = 30_000;

/**
 * Object storage the context can *construct* but never reach.
 *
 * Deliberate: the bucket probe is the startup gate, and the gate is read by
 * `readiness()` — which is downstream of the failure being injected. Requiring
 * a real MinIO here would prove nothing extra and would make a process-boundary
 * test depend on a container. The values are synthetic and local-only.
 */
const UNREACHABLE_STORAGE = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:59998',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'e01bootstrapkey',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'e01-bootstrap-local-secret',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'e01-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'e01-derivatives',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
} as const;

interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly killed: boolean;
  readonly output: string;
  readonly elapsedMs: number;
}

function runWorker(env: Record<string, string>): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [MAIN_PATH], {
      cwd: WORKER_ROOT,
      env: { ...process.env, NODE_ENV: 'test', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const collect = (chunk: Buffer): void => {
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    let killed = false;
    const kill = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, EXIT_BUDGET_MS);

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(kill);
      resolve({ code, signal, killed, output, elapsedMs: Date.now() - startedAt });
    });
  });
}

describe('APP12-E01 §18 — worker bootstrap failure ends the process', () => {
  let disposable: DisposableDatabase;
  let result: ChildResult;

  beforeAll(async () => {
    if (!existsSync(MAIN_PATH)) {
      throw new Error(
        `The worker is not built. Run \`pnpm --filter @embroidery/worker build\` first (${MAIN_PATH}).`,
      );
    }
    // A real, reachable database with a valid policy. The context has to reach
    // the half-started state for the test to mean anything: a worker that fails
    // during module initialisation never starts a timer and was never the bug.
    disposable = await createDisposableDatabase('e01-bootstrap-abort');
    await seedWorkerPolicy(disposable);

    result = await runWorker({
      DATABASE_URL: disposable.url,
      DATABASE_SSL_MODE: 'disable',
      NOTIFICATION_TRANSPORT: 'RECORDING',
      ...UNREACHABLE_STORAGE,
      METRICS_ENABLED: 'true',
      // The controlled pre-readiness failure. Rejected by `resolveMetricsPort`,
      // which runs after every bootstrap hook and outside the listener's own
      // error handling.
      METRICS_PORT: '0',
    });
  }, 300_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  it('reaches the half-started window before failing', () => {
    // Without this the rest of the suite would pass against a worker that never
    // started a timer at all — a different, already-safe failure mode.
    //
    // Both sweeps re-arm themselves, so either one alone holds the event loop
    // open and keeps a failed process alive forever — exactly what
    // `FU-APP12-H07-03` observed on the cluster. The job poll loop is
    // deliberately not asserted here: this run's object storage is unreachable,
    // so the startup gate closes and the loop correctly claims nothing. The two
    // timers are the holders that matter.
    expect(result.output).toContain('APP5 intake cleanup started');
    expect(result.output).toContain('Ready-Made reservation expiry started');
  });

  it('fails on the injected pre-readiness bootstrap error', () => {
    expect(result.output).toContain('Worker bootstrap failed before readiness; exiting.');
    expect(result.output).toContain('Invalid METRICS_PORT');
  });

  it('never reports itself ready and binds no metrics listener', () => {
    // The state that made the defect undiagnosable: alive, but with both
    // gauges an operator would reach for absent.
    expect(result.output).not.toContain('Worker readiness:');
    expect(result.output).not.toContain('Worker metrics listening');
  });

  it('exits deterministically instead of remaining alive half-started', () => {
    expect(result.killed).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.code).not.toBe(0);
    expect(result.elapsedMs).toBeLessThan(EXIT_BUDGET_MS);
  });
});
