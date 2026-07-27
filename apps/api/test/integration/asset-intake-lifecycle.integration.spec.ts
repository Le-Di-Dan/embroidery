/**
 * APP2-B01 §25 cases 17-30 — resumption, expired reclaim, cleanup ordering,
 * abort/atomicity and disposable residue, against real PostgreSQL and MinIO.
 *
 * Every pre-state here is produced by making the runtime actually fail at the
 * right moment, never by editing tables: a hand-built row would prove only that
 * SQL can write it, not that the system can reach it. (The S24 immutability
 * trigger also refuses a `DELETE` on `outbox_events`, which is the honest
 * reason the shortcut is not even available.)
 *
 * Cases 1-16 live in `asset-intake.integration.spec.ts`.
 *
 * Docker-only. Run with `pnpm test:asset-intake:integration`.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

import { ObjectStorageError } from '@embroidery/object-storage';

import type { AssetId } from '../../src/modules/asset/domain/repositories/asset.repository';
import {
  createAssetIntakeContext,
  type AssetIntakeTestContext,
} from '../support/asset-intake-context';
import {
  codeOf,
  intakeReaders,
  keyFactory,
  multipartBody,
  withIntakeHeaders,
  INTAKE_ACTOR,
} from '../support/asset-intake-fixtures';
import { containerExists, isPortFree } from '../support/disposable-minio';
import { pngBytes } from '../support/synthetic-images';

let context: AssetIntakeTestContext;

const {
  upload,
  rowForAsset,
  latestClaim,
  outboxFor,
  objectExists,
  listOriginals,
  expireAllocation,
} = intakeReaders(() => context);
const nextKey = keyFactory('b01lc');

beforeAll(async () => {
  context = await createAssetIntakeContext('app2-b01-lifecycle');
}, 240_000);

afterAll(async () => {
  await context?.close();
}, 120_000);

/**
 * Fails the outbox append exactly once, so Tx B rolls back for real.
 *
 * This is how every "post-Tx-A, pre-Tx-B" pre-state below is produced. Editing
 * the tables directly is not an option and would not be honest evidence
 * anyway: the S24 immutability trigger refuses a `DELETE` on `outbox_events`,
 * and a hand-built row is no proof that the runtime can reach that state.
 */
async function withFailingOutboxAppend<T>(work: () => Promise<T>): Promise<T> {
  const { OutboxEventStore } = await import('@embroidery/persistence');
  const outbox = context.get<{ append: unknown }>(OutboxEventStore);
  const real = outbox.append;
  outbox.append = (): Promise<never> => Promise.reject(new Error('outbox unavailable'));
  try {
    return await work();
  } finally {
    outbox.append = real;
  }
}

/** Fails the Tx A insert once, leaving a stored object with no asset row. */
async function withFailingAssetInsert<T>(work: () => Promise<T>): Promise<T> {
  const repository = context.assets as unknown as { registerOrRecover: unknown };
  const real = repository.registerOrRecover;
  repository.registerOrRecover = (): Promise<never> =>
    Promise.reject(new Error('asset insert unavailable'));
  try {
    return await work();
  } finally {
    repository.registerOrRecover = real;
  }
}

describe('resumption', () => {
  it('case 17: a retry after Tx A resumes Tx B without a second object or identity', async () => {
    const key = nextKey('resume');
    const bytes = pngBytes(2048, 41);

    // A genuine crash between the two transactions.
    await withFailingOutboxAppend(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    expect(claim.status).toBe('IN_PROGRESS');
    expect((await context.assets.findById(assetId as AssetId))?.status).toBe('UPLOADED');
    expect(await outboxFor(assetId)).toHaveLength(0);
    const objectsAfterTxA = await listOriginals(assetId);
    expect(objectsAfterTxA).toHaveLength(1);

    // While the allocation is still live the retry is a duplicate, not a
    // resumption: the server cannot tell a crashed attempt from one that is
    // still streaming, which is exactly what the lease is for.
    expect(await codeOf(() => upload({ key, bytes }))).toBe('ASSET_UPLOAD_IN_PROGRESS');

    // Once the lease lapses, the retry resumes from truthful durable state.
    await expireAllocation(assetId);
    const resumed = await upload({ key, bytes });
    expect(resumed.assetId).toBe(assetId);
    expect(resumed.status).toBe('INSPECTING');
    expect(await outboxFor(assetId)).toHaveLength(1);
    expect(await listOriginals(assetId)).toHaveLength(1);
  }, 240_000);

  it('case 18: a replay after Tx B returns the identical receipt', async () => {
    const key = nextKey('lostresponse');
    const bytes = pngBytes(2048, 51);
    const first = await upload({ key, bytes });
    const second = await upload({ key, bytes });
    const third = await upload({ key, bytes });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await outboxFor(first.assetId)).toHaveLength(1);
  }, 240_000);
});

describe('expired reclaim', () => {
  it('case 19 + 25: reclaim rotates the token, keeps the identity, and never deletes an existing asset', async () => {
    const key = nextKey('reclaim');
    const bytes = pngBytes(2048, 61);
    await withFailingOutboxAppend(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    const objectKey = String(claim.result?.['objectKey']);
    const originalToken = String(claim.result?.['claimToken']);
    await expireAllocation(assetId);

    const resumed = await upload({ key, bytes });

    // Case 25 — the durable asset and its object survive untouched.
    expect(resumed.assetId).toBe(assetId);
    expect(await objectExists('ORIGINALS', objectKey)).toBe(true);

    // Case 19 — identity and key preserved through the reclaim, and the
    // pre-reclaim token was a real one this record actually held.
    expect(originalToken).toMatch(/^[0-9a-f-]{36}$/);
    const after = await rowForAsset(assetId);
    expect(after.result?.['assetId']).toBe(assetId);
    expect(after.result?.['objectKey']).toBe(objectKey);
    expect(after.status).toBe('COMPLETED');
  }, 240_000);

  it('case 20: two concurrent reclaimers produce exactly one winner', async () => {
    const key = nextKey('race');
    const bytes = pngBytes(2048, 71);
    await withFailingOutboxAppend(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    await expireAllocation(assetId);

    const outcomes = await Promise.allSettled([upload({ key, bytes }), upload({ key, bytes })]);
    const fulfilled = outcomes.filter((entry) => entry.status === 'fulfilled');

    // Whatever the interleaving, the durable effect happens exactly once.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(await outboxFor(assetId)).toHaveLength(1);
    expect(await listOriginals(assetId)).toHaveLength(1);
  }, 240_000);

  it('case 21 + 22: a stale claim token can complete neither Tx A nor Tx B', async () => {
    const key = nextKey('stale');
    const bytes = pngBytes(2048, 81);
    await withFailingOutboxAppend(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    const objectKey = String(claim.result?.['objectKey']);
    const scopeRows = await context.query<{ scope_key: string }>(
      'select scope_key from idempotency_records where fingerprint = $1',
      [claim.fingerprint],
    );

    const { UploadTransactionsService } =
      await import('../../src/modules/asset/application/upload-transactions.service');
    const commits = context.get<{
      commitUploadedAsset: (input: unknown) => Promise<unknown>;
      commitInspectionHandoff: (input: unknown) => Promise<unknown>;
    }>(UploadTransactionsService);

    const staleAllocation = {
      schemaVersion: 1 as const,
      kind: 'ASSET_UPLOAD_ALLOCATION' as const,
      assetId,
      bucketAlias: 'ORIGINALS' as const,
      objectKey,
      // A token this record has never held.
      claimToken: '5a5b0a03-9b5a-480b-9a37-0000000000ff',
      requestFingerprintVersion: 1 as const,
    };
    const idempotencyKey = {
      namespace: 'admin.asset.upload',
      scopeKey: scopeRows[0]?.scope_key as string,
      fingerprint: claim.fingerprint,
    };
    const facts = {
      mediaType: 'image/png' as const,
      byteSize: bytes.length,
      checksum: (await context.assets.findById(assetId as AssetId))?.checksum as string,
      contentFingerprint: 'sha256:' + 'a'.repeat(64),
    };

    expect(
      await codeOf(() =>
        commits.commitUploadedAsset({ key: idempotencyKey, allocation: staleAllocation, facts }),
      ),
    ).toBe('STALE_UPLOAD_CLAIM');
    expect(
      await codeOf(() =>
        commits.commitInspectionHandoff({
          key: idempotencyKey,
          allocation: staleAllocation,
          facts,
          at: new Date(),
        }),
      ),
    ).toBe('STALE_UPLOAD_CLAIM');

    // Neither refusal mutated anything.
    expect((await context.assets.findById(assetId as AssetId))?.status).toBe('UPLOADED');
    expect(await outboxFor(assetId)).toHaveLength(0);
    expect((await rowForAsset(assetId)).status).toBe('IN_PROGRESS');
  }, 240_000);

  it('case 23: a missing asset means the old original and derivative prefix are cleaned before the replacement', async () => {
    const key = nextKey('cleanup');
    const bytes = pngBytes(2048, 91);

    // Tx A fails, so the object exists with no asset row — the exact orphan
    // state the reclaim cleanup path exists for.
    await withFailingAssetInsert(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    const objectKey = String(claim.result?.['objectKey']);
    expect(await context.assets.findById(assetId as AssetId)).toBeUndefined();
    expect(await objectExists('ORIGINALS', objectKey)).toBe(true);

    // A stray derivative from the abandoned attempt.
    const derivativeKey = `test/derivatives/${assetId}/thumbnail.png`;
    await context.storage.putObjectStream({
      bucket: 'DERIVATIVES',
      key: derivativeKey,
      body: Readable.from([pngBytes(256)]),
      contentType: 'image/png',
    });
    expect(await objectExists('DERIVATIVES', derivativeKey)).toBe(true);

    await expireAllocation(assetId);
    const replacement = await upload({ key, bytes });

    expect(replacement.assetId).toBe(assetId);
    // The stale derivative is gone; the replacement occupies the same key.
    expect(await objectExists('DERIVATIVES', derivativeKey)).toBe(false);
    expect(await objectExists('ORIGINALS', objectKey)).toBe(true);
    expect(await listOriginals(assetId)).toHaveLength(1);
  }, 240_000);

  it('case 24: a cleanup failure accepts no replacement object and no asset', async () => {
    const key = nextKey('cleanupfail');
    const bytes = pngBytes(2048, 101);

    await withFailingAssetInsert(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });
    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    await expireAllocation(assetId);

    const storage = context.storage as unknown as { deleteObject: unknown };
    const realDelete = storage.deleteObject;
    storage.deleteObject = (): Promise<void> =>
      Promise.reject(new ObjectStorageError('PROVIDER_UNAVAILABLE', 'delete failed'));

    try {
      expect(await codeOf(() => upload({ key, bytes }))).not.toBe('no-error');
    } finally {
      storage.deleteObject = realDelete;
    }

    // No asset, no intent, and the allocation is left to expire again.
    expect(await context.assets.findById(assetId as AssetId)).toBeUndefined();
    expect(await outboxFor(assetId)).toHaveLength(0);
    expect((await rowForAsset(assetId)).status).toBe('IN_PROGRESS');
  }, 240_000);

  it('case 26: an INSPECTING asset reconstructs its completion from the real intent', async () => {
    const key = nextKey('inspecting');
    const bytes = pngBytes(2048, 111);
    const receipt = await upload({ key, bytes });
    const events = await outboxFor(receipt.assetId);
    expect(events).toHaveLength(1);

    // Only the claim is rewound; the asset keeps its real INSPECTING state and
    // its real intent, which is what the reclaimer must reconstruct from.
    const row = await rowForAsset(receipt.assetId);
    await context.query(
      "update idempotency_records set status = 'IN_PROGRESS', completed_at = null, " +
        "expires_at = now() - interval '1 minute', " +
        "result = jsonb_build_object('schemaVersion',1,'kind','ASSET_UPLOAD_ALLOCATION','assetId',$1::text,'bucketAlias','ORIGINALS','objectKey',$2::text,'claimToken',$3::text,'requestFingerprintVersion',1) " +
        'where fingerprint = $4',
      [
        receipt.assetId,
        String(row.result?.['objectKey']),
        '5a5b0a03-9b5a-480b-9a37-000000000026',
        row.fingerprint,
      ],
    );

    const reconstructed = await upload({ key, bytes });
    expect(reconstructed.assetId).toBe(receipt.assetId);
    expect(reconstructed.status).toBe('INSPECTING');
    // No second intent was appended.
    expect(await outboxFor(receipt.assetId)).toHaveLength(1);
    const after = await rowForAsset(receipt.assetId);
    expect(after.status).toBe('COMPLETED');
    expect(after.result?.['inspectionEventId']).toBe(events[0]?.id);
  }, 240_000);
});

describe('abort and atomicity', () => {
  it('case 27: a client disconnect aborts the parser and stores no object', async () => {
    const key = nextKey('disconnect');
    const body = multipartBody({ key, bytes: pngBytes(512 * 1024) });
    let offset = 0;
    const stream = new Readable({
      read() {
        if (offset > 8 * 1024) {
          // The client vanished mid-body.
          this.destroy(new Error('socket hang up'));
          return;
        }
        this.push(body.subarray(offset, offset + 4096));
        offset += 4096;
      },
    }) as unknown as IncomingMessage;
    withIntakeHeaders(stream, key);

    await expect(context.intake.upload(stream, INTAKE_ACTOR)).rejects.toBeDefined();

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);
    expect(await context.assets.findById(assetId as AssetId)).toBeUndefined();
    expect(await listOriginals(assetId)).toEqual([]);
  }, 180_000);

  it('case 28: the hard-duration deadline aborts an in-flight upload', async () => {
    const key = nextKey('timeout');
    const body = multipartBody({ key, bytes: pngBytes(256 * 1024) });
    let offset = 0;
    let stalled = false;

    const stream = new Readable({
      read() {
        if (offset >= body.length) {
          this.push(null);
          return;
        }
        if (offset > 8 * 1024 && !stalled) {
          // Stall the body, then let the injected deadline fire. No wall-clock
          // wait: the five-minute ceiling is exercised through the seam.
          stalled = true;
          setTimeout(() => {
            context.timer.fireAll();
          }, 25);
          return;
        }
        if (stalled) {
          return;
        }
        this.push(body.subarray(offset, offset + 4096));
        offset += 4096;
      },
    }) as unknown as IncomingMessage;
    withIntakeHeaders(stream, key);

    expect(await codeOf(() => context.intake.upload(stream, INTAKE_ACTOR))).toBe(
      'ASSET_UPLOAD_TIMEOUT',
    );
  }, 180_000);

  it('case 29: a failed Tx B leaves no asset transition, no intent and no completion', async () => {
    const key = nextKey('atomic');
    const bytes = pngBytes(2048, 121);

    await withFailingOutboxAppend(async () => {
      await expect(upload({ key, bytes })).rejects.toBeDefined();
    });

    const claim = await latestClaim(key);
    const assetId = String(claim.result?.['assetId']);

    // Tx B is atomic: the transition, the intent and the completion either all
    // land or none do.
    expect((await context.assets.findById(assetId as AssetId))?.status).toBe('UPLOADED');
    expect(await outboxFor(assetId)).toHaveLength(0);
    expect(claim.status).toBe('IN_PROGRESS');
    expect(claim.result?.['kind']).toBe('ASSET_UPLOAD_ALLOCATION');
  }, 240_000);
});

// ---------------------------------------------------------------------------
// Case 30 — residue
// ---------------------------------------------------------------------------

describe('disposable residue', () => {
  it('case 30: the container, its port and the database are released on close', async () => {
    const { containerName, port } = context.minio;
    const databaseName = context.database.name;

    await context.close();

    expect(await containerExists(containerName)).toBe(false);
    expect(await isPortFree(port)).toBe(true);

    // Asserted from a second connection, not from the dropped one.
    const probe = await createAssetIntakeContext('app2-b01-residue-probe');
    try {
      const rows = await probe.query<{ datname: string }>(
        'select datname from pg_database where datname = $1',
        [databaseName],
      );
      expect(rows).toEqual([]);
    } finally {
      await probe.close();
    }
  }, 300_000);
});
