/**
 * APP2-I03 §13 — the real worker process against a real, empty object store.
 *
 * Everything else in the I03 suite runs inside Jest with a test double for the
 * gate. This is the only test where the production composition actually runs:
 * the built `dist/main.js`, the real `WorkerObjectStorageModule`, the real
 * `ensurePrivateBuckets` against a MinIO that starts with **no buckets at all**.
 *
 * The buckets are asserted to be absent first. Without that, a store that
 * happened to be pre-provisioned would let this test pass while proving
 * nothing — which is exactly the state the checkpoint exists to fix.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createS3ObjectStorage, loadObjectStorageConfig } from '@embroidery/object-storage';
import type { ObjectStoragePort } from '@embroidery/object-storage';
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
} from '../../test/support/disposable-minio';
import { seedWorkerPolicy } from './tests/worker-runtime-context';

const WORKER_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(WORKER_ROOT, 'dist', 'main.js');
const CHILD_PATH = path.join(WORKER_ROOT, 'src', 'runtime', 'tests', 'worker-smoke-child.mjs');
const SHUTDOWN_BUDGET_MS = 30_000;

interface ChildResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runWorker(env: Record<string, string>): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_PATH, MAIN_PATH, '1500'], {
      cwd: WORKER_ROOT,
      env: { ...process.env, ...env },
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
    child.once('exit', (code) => {
      clearTimeout(kill);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('worker private-bucket bootstrap (real process)', () => {
  let disposable: DisposableDatabase;
  let minio: DisposableMinio;
  let storage: ObjectStoragePort;
  let bucketsBefore: string[];
  let result: ChildResult;

  beforeAll(async () => {
    if (!existsSync(MAIN_PATH)) {
      throw new Error(
        `The worker is not built. Run \`pnpm --filter @embroidery/worker build\` first (${MAIN_PATH}).`,
      );
    }
    disposable = await createDisposableDatabase('i03-worker-bootstrap');
    await seedWorkerPolicy(disposable);
    minio = await startDisposableMinio();
    // Reads go through the accepted port, not a second SDK surface.
    storage = createS3ObjectStorage(
      loadObjectStorageConfig({ NODE_ENV: 'test', ...minioEnv(minio) }),
    );

    bucketsBefore = await listBucketDirectories(minio.containerName);

    result = await runWorker({
      NODE_ENV: 'test',
      DATABASE_URL: disposable.url,
      DATABASE_SSL_MODE: 'disable',
      ...minioEnv(minio),
    });
  }, 300_000);

  afterAll(async () => {
    await minio?.stop();
    await disposable?.drop();
  });

  it('starts against a store with no buckets at all', () => {
    expect(bucketsBefore).toEqual([]);
  });

  it('creates exactly the two private buckets and nothing else', async () => {
    const after = await listBucketDirectories(minio.containerName);
    expect(after).toEqual([minio.derivativesBucket, minio.originalsBucket].sort());
  });

  it('leaves both buckets usable by their owner', async () => {
    // A listing against a missing bucket rejects; an empty result is proof the
    // bucket exists and is readable with the configured credentials.
    await expect(
      storage.listObjectsByPrefix({ bucket: 'ORIGINALS', prefix: 'test/' }),
    ).resolves.toEqual([]);
    await expect(
      storage.listObjectsByPrefix({ bucket: 'DERIVATIVES', prefix: 'test/' }),
    ).resolves.toEqual([]);
  });

  it('denies anonymous access to a created bucket', async () => {
    // The bootstrap creates buckets and applies no policy — the one thing that
    // could make one public. An unauthenticated list must not be served.
    const response = await fetch(`${minio.endpoint}/${minio.originalsBucket}/`);
    expect(response.ok).toBe(false);
    expect([401, 403]).toContain(response.status);
  });

  it('logs the verification and becomes ready', () => {
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('Private object-storage buckets verified (component=worker)');
    expect(output).toContain('Worker readiness: ready (ok)');
  });

  it('stays idle with an empty production registry', () => {
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('0 handler(s) registered');
  });

  it('exits 0 on shutdown', () => {
    expect(result.code).toBe(0);
  });

  it('leaks no credential into the process output', () => {
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain(TEST_SECRET_ACCESS_KEY);
    expect(output).not.toContain(TEST_ACCESS_KEY_ID);
  });

  it('leaves zero residue', async () => {
    await minio.stop();
    await disposable.drop();
    await expect(containerExists(minio.containerName)).resolves.toBe(false);
  });
});
