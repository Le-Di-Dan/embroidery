/**
 * The shipped worker image, processing a real asset (APP2-W01 §21).
 *
 * Everything before this file drives the use case in-process. This one runs the
 * production `runner` image as PID 1 in a Linux container and gives it nothing
 * but a database row and an object — no test hooks, no injected doubles, no
 * TypeScript. It is the only place that can prove the things that only exist in
 * the shipped artifact: that the Linux `sharp` binary loads at all, that the
 * private-bucket gate opens before the first claim, that the poll loop finds
 * `asset.inspection.requested` under `ASSET_PROCESSING`, and that a real
 * SIGTERM still ends the process with exit 0 now that it has work to do.
 *
 * The database and the store both run on the host and are reached through
 * `host.docker.internal`, so teardown stays a single `drop()` and a single
 * `stop()`.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import { createS3ObjectStorage, type ObjectStoragePort } from '@embroidery/object-storage';

import {
  containerEnvArgs,
  startDisposableMinio,
  TEST_ACCESS_KEY_ID,
  TEST_SECRET_ACCESS_KEY,
  type DisposableMinio,
} from '../support/disposable-minio';
import { seedWorkerPolicy } from '../../src/runtime/tests/worker-runtime-context';
import type { WorkerRuntimePolicy } from '../../src/runtime/policy/worker-runtime-policy';
import {
  pngWithAlpha,
  type SyntheticImage,
} from '../../src/jobs/asset-inspection/tests/image-fixtures';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const IMAGE_TAG = 'embroidery-w01-worker:test';
const SHUTDOWN_BUDGET_MS = 30_000;

interface Command {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], timeoutMs = 1_800_000): Promise<Command> {
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

/** Real image work needs a real timeout; the I02 fixture's 300 ms does not. */
const WORKER_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 250,
  leaseDurationMs: 30_000,
  handlerTimeoutMs: 20_000,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 5_000,
  maxAttempts: 3,
  backoffBaseMs: 50,
  backoffMaxMs: 500,
};

describe('asset-processing worker smoke (shipped Linux image)', () => {
  let disposable: DisposableDatabase;
  let minio: DisposableMinio;
  let storage: ObjectStoragePort;
  const containerName = `embroidery-w01-${randomUUID().slice(0, 8)}`;
  let logs = '';
  let exitCode = Number.NaN;
  let shutdownMs = Number.NaN;
  let assetId = '';
  let eventId = 0n;
  let image: SyntheticImage;

  async function query<TRow extends Record<string, unknown>>(
    statement: ReturnType<typeof sql>,
  ): Promise<TRow[]> {
    return (await executeRaw<TRow>(disposable.client.db, statement)) as TRow[];
  }

  beforeAll(async () => {
    await docker(['version', '--format', '{{.Server.Version}}'], 60_000);
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

    disposable = await createDisposableDatabase('w01-smoke');
    minio = await startDisposableMinio();

    // The host-side client exists only to seed. It uses the same package the
    // worker uses, so the object it writes is addressed exactly the way the
    // worker will look for it.
    storage = createS3ObjectStorage({
      provider: 's3',
      environment: 'test',
      endpoint: minio.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      originalsBucket: minio.originalsBucket,
      derivativesBucket: minio.derivativesBucket,
      credentials: {
        accessKeyId: TEST_ACCESS_KEY_ID,
        secretAccessKey: TEST_SECRET_ACCESS_KEY,
      },
    });
    await storage.ensurePrivateBuckets();

    image = await pngWithAlpha(1400, 900);
    assetId = newId();
    const originalKey = `test/originals/${assetId}/original.png`;
    await storage.putObjectStream({
      bucket: 'ORIGINALS',
      key: originalKey,
      body: Readable.from([image.bytes]),
      contentType: 'image/png',
    });

    // Published through the canonical versioned path (`PolicyConfigurationRepository`),
    // not by hand: the policy tables carry generated ids and an audit edge, and
    // a hand-written insert would be testing a row shape the application never
    // produces.
    await seedWorkerPolicy(disposable, WORKER_POLICY);

    // A B01-equivalent handoff: the asset row Tx A/Tx B leave behind, plus the
    // inspection intent Tx B appends.
    await executeRaw(
      disposable.client.db,
      sql`
        insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
        values (${assetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${originalKey}, 'image/png',
                ${image.byteSize.toString()}::bigint, ${image.checksum}, 'INSPECTING')
      `,
    );
    const inserted = await executeRaw<{ id: string }>(
      disposable.client.db,
      sql`
        insert into outbox_events
          (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
           status, attempt_count, next_attempt_at)
        values ('asset.inspection.requested', 'ASSET', ${assetId},
                ${JSON.stringify({ schemaVersion: 1, assetId })}::jsonb, 1, 'PENDING', 0, NULL)
        returning id
      `,
    );
    eventId = BigInt(String(inserted[0]?.['id']));

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
      // The image defaults to production, whose config guard correctly refuses
      // an unencrypted connection. The disposable database is local and has no
      // TLS, so the shipped binary runs in development mode rather than the
      // guard being weakened. `NODE_ENV` also namespaces the object keys, and
      // the seeded key above uses `test/`, so it is set explicitly below.
      '--env',
      'NODE_ENV=test',
      ...containerEnvArgs(minio),
      IMAGE_TAG,
    ]);

    // Poll the durable state, not a log line: what matters is that the asset
    // reached its terminal state, and a log could say anything.
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const rows = await query<{ status: string }>(
        sql`select status from assets where id = ${assetId}`,
      );
      const current = String(rows[0]?.status ?? '');
      if (current === 'ACCEPTED' || current === 'REJECTED') {
        break;
      }
      await delay(500);
    }
    logs = (await docker(['logs', containerName])).stdout;

    const signalAt = Date.now();
    await docker(['kill', '--signal=TERM', containerName]);
    const waited = await run('docker', ['wait', containerName], SHUTDOWN_BUDGET_MS);
    shutdownMs = Date.now() - signalAt;
    exitCode = Number(waited.stdout.trim());
    logs = `${logs}${(await docker(['logs', containerName])).stdout}`;
  }, 2_400_000);

  afterAll(async () => {
    await run('docker', ['rm', '--force', '--volumes', containerName], 60_000);
    await run('docker', ['image', 'rm', '--force', IMAGE_TAG], 120_000);
    await minio?.stop();
    await disposable?.drop();
  }, 300_000);

  it('opens the private-bucket startup gate before claiming anything', () => {
    expect(logs).toContain('Private object-storage buckets verified (component=worker)');
    expect(logs).toContain('Worker readiness: ready (ok)');
  });

  it('registers exactly one production handler', () => {
    expect(logs).toContain('1 handler(s) registered');
  });

  it('claims the event under the ASSET_PROCESSING job kind', async () => {
    const attempts = await query<{ job_kind: string; outcome: string; attempt_no: number }>(sql`
      select job_kind, outcome, attempt_no from background_job_attempts
       where job_key = ${eventId.toString()} order by attempt_no
    `);

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ job_kind: 'ASSET_PROCESSING', attempt_no: 1 });
  });

  it('drives the asset to ACCEPTED', async () => {
    expect(
      await query<{ status: string }>(sql`select status from assets where id = ${assetId}`),
    ).toEqual([{ status: 'ACCEPTED' }]);
  });

  it('leaves both derivatives READY and unwatermarked', async () => {
    const rows = await query<{ kind: string; status: string; is_watermarked: boolean }>(sql`
      select kind, status, is_watermarked from asset_derivatives
       where asset_id = ${assetId} order by kind
    `);

    expect(rows).toEqual([
      { kind: 'CATALOG_PREVIEW', status: 'READY', is_watermarked: false },
      { kind: 'THUMBNAIL', status: 'READY', is_watermarked: false },
    ]);
  });

  it('wrote both private objects', async () => {
    const listed = await storage.listObjectsByPrefix({
      bucket: 'DERIVATIVES',
      prefix: `test/derivatives/${assetId}/`,
    });

    expect(listed.map((object) => object.key).sort()).toEqual([
      `test/derivatives/${assetId}/CATALOG_PREVIEW.webp`,
      `test/derivatives/${assetId}/THUMBNAIL.webp`,
    ]);
    expect(listed.every((object) => object.sizeBytes > 0)).toBe(true);
  });

  it('appended exactly one accepted inspection', async () => {
    const rows = await query<{ outcome: string }>(
      sql`select outcome from asset_inspections where asset_id = ${assetId}`,
    );

    expect(rows).toEqual([{ outcome: 'ACCEPTED' }]);
  });

  it('dispatched the source event and recorded one successful attempt', async () => {
    const rows = await query<{ status: string; attempt_count: number; last_error: string | null }>(
      sql`select status, attempt_count, last_error from outbox_events where id = ${eventId}`,
    );
    const attempts = await query<{ outcome: string }>(
      sql`select outcome from background_job_attempts where job_key = ${eventId.toString()}`,
    );

    expect(rows[0]).toMatchObject({ status: 'DISPATCHED', attempt_count: 1, last_error: null });
    expect(attempts).toEqual([{ outcome: 'SUCCEEDED' }]);
  });

  it('keeps the original in place', async () => {
    await expect(
      storage.headObject({ bucket: 'ORIGINALS', key: `test/originals/${assetId}/original.png` }),
    ).resolves.toMatchObject({ sizeBytes: image.byteSize });
  });

  it('logs no key, checksum, filename or fabricated request id (FU-A07)', () => {
    expect(logs).not.toContain('originals/');
    expect(logs).not.toContain('derivatives/');
    expect(logs).not.toContain(image.checksum);
    expect(logs).not.toContain('sha256:');
    expect(logs).not.toContain('requestId');
    expect(logs).not.toContain(TEST_SECRET_ACCESS_KEY);
    // The correlation id is the attempt's own identity, not an invented HTTP one.
    expect(logs).toContain(`ASSET_PROCESSING:${eventId.toString()}:1`);
  });

  it('exits 0 on a real SIGTERM, within the shutdown budget', () => {
    console.log(`[w01-smoke] real SIGTERM → exit ${String(exitCode)} in ${String(shutdownMs)}ms`);
    expect(exitCode).toBe(0);
    expect(shutdownMs).toBeLessThan(SHUTDOWN_BUDGET_MS);
  });

  it('leaves no container or image behind', async () => {
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
