/**
 * APP2-I02-C1 §9 — real operating-system SIGTERM.
 *
 * The I02 smoke raised the signal with `process.emit('SIGTERM')`. That proves a
 * listener is attached and nothing more: it never leaves the Node process, so
 * it cannot show that the kernel's signal reaches PID 1, that Nest's handler
 * runs on real delivery, or what exit code the container reports. On Windows —
 * the development host — there is no SIGTERM to send at all: `child.kill` there
 * calls `TerminateProcess` and no handler ever runs.
 *
 * So the acceptance evidence runs the production `runner` image in a Linux
 * container and delivers a genuine signal with `docker kill --signal=TERM`.
 * The `process.emit` smoke stays as a fast unit-level check; it is no longer
 * the proof.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';

import { outboxState, seedDueEvent, seedWorkerPolicy } from './tests/worker-runtime-context';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const IMAGE_TAG = 'embroidery-i02c1-worker:test';
const SHUTDOWN_BUDGET_MS = 30_000;

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

describe('worker signal smoke (real Linux SIGTERM)', () => {
  let disposable: DisposableDatabase;
  const containerName = `embroidery-i02c1-${randomUUID().slice(0, 8)}`;
  let logs = '';
  let exitCode = Number.NaN;
  let shutdownMs = Number.NaN;
  let eventId: bigint;

  beforeAll(async () => {
    await docker(['version', '--format', '{{.Server.Version}}'], 60_000);

    // The production image, not a test-only one: this suite is about how the
    // shipped process behaves.
    await docker([
      'build',
      '--file',
      'infrastructure/docker/worker.Dockerfile',
      '--target',
      'runner',
      '--tag',
      IMAGE_TAG,
      '.',
    ]);

    disposable = await createDisposableDatabase('i02c1-signal');
    await seedWorkerPolicy(disposable);
    // A due event the empty production registry cannot handle: an idle worker
    // must leave it untouched.
    eventId = await seedDueEvent(disposable);

    // The container reaches the host's PostgreSQL, not a container-internal
    // one, so the disposable database this suite owns is the only database
    // involved and teardown stays a single `drop()`.
    const containerUrl = new URL(disposable.url);
    containerUrl.hostname = 'host.docker.internal';

    await docker([
      'run',
      '--detach',
      '--name',
      containerName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '--env',
      `DATABASE_URL=${containerUrl.toString()}`,
      '--env',
      'DATABASE_SSL_MODE=disable',
      // The image defaults to `NODE_ENV=production`, whose config guard
      // correctly refuses an unencrypted connection. This suite is about signal
      // delivery and the exit code, and its database is a local disposable one
      // with no TLS, so it runs the shipped binary in development mode rather
      // than weakening that guard.
      '--env',
      'NODE_ENV=development',
      IMAGE_TAG,
    ]);

    // Readiness is a log line, not an endpoint: the worker deliberately has no
    // HTTP surface (APP2-I02 §15).
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      logs = (await docker(['logs', containerName])).stdout;
      if (logs.includes('Worker readiness:')) {
        break;
      }
      await delay(500);
    }

    // Let it poll for a while, then deliver a genuine SIGTERM from the kernel.
    await delay(2_000);
    const signalAt = Date.now();
    await docker(['kill', '--signal=TERM', containerName]);

    const waited = await run('docker', ['wait', containerName], SHUTDOWN_BUDGET_MS);
    shutdownMs = Date.now() - signalAt;
    exitCode = Number(waited.stdout.trim());
    logs = (await docker(['logs', containerName])).stdout;
  }, 1_200_000);

  afterAll(async () => {
    await run('docker', ['rm', '--force', '--volumes', containerName], 60_000);
    await run('docker', ['image', 'rm', '--force', IMAGE_TAG], 120_000);
    await disposable?.drop();
  });

  it('boots the shipped image and reports itself ready', () => {
    expect(logs).toContain('Worker readiness: ready (ok)');
    expect(logs).toContain('0 handler(s) registered');
  });

  it('steals no event while its registry is empty', async () => {
    const state = await outboxState(disposable, eventId);

    expect(state.status).toBe('PENDING');
    expect(state.attemptCount).toBe(0);
    expect(state.claimedBy).toBeNull();
  });

  it("runs Nest's signal handler on real SIGTERM delivery", () => {
    // Proof the kernel signal reached PID 1 and the handler ran — the exact
    // step `process.emit` could never demonstrate.
    expect(logs).toContain('Poll loop stopped claiming.');
    expect(logs).toContain('Worker runtime stopped (SIGTERM)');
  });

  it('exits 0 within the shutdown budget', () => {
    // Zero, not 143: `useProcessExit` means a completed drain reports success
    // rather than "killed by signal", which is what an orchestrator reads.
    // Printed because it is the checkpoint's acceptance evidence: a reviewer
    // reading CI output should see the real number, not just a passing budget.
    console.log(
      `[signal-smoke] real SIGTERM → exit ${String(exitCode)} in ${String(shutdownMs)}ms`,
    );
    expect(exitCode).toBe(0);
    expect(shutdownMs).toBeLessThan(SHUTDOWN_BUDGET_MS);
  });

  it('leaves no container or image behind', async () => {
    // The removal happens here rather than in `afterAll` so its result can
    // actually be asserted; `afterAll` only repeats it defensively.
    await run('docker', ['rm', '--force', '--volumes', containerName], 60_000);
    await run('docker', ['image', 'rm', '--force', IMAGE_TAG], 120_000);

    const containers = await docker([
      'ps',
      '--all',
      '--quiet',
      '--filter',
      `name=^${containerName}$`,
    ]);
    const images = await docker(['images', '--quiet', IMAGE_TAG]);

    expect(containers.stdout.trim()).toBe('');
    expect(images.stdout.trim()).toBe('');
  });
});
