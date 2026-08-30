/**
 * Shared harness for the `APP7-B06` Admin transfer-evidence delivery suite.
 *
 * Built on `createAdminPaymentContext`, which is `APP7-B04`'s delivered fixture:
 * the whole application over real HTTP against a disposable PostgreSQL, a real
 * bootstrapped Admin account and a real login, so the `AuthenticatedAdminGuard`
 * that protects this route is the production one rather than a stub. Nothing
 * under test is overridden — B06's defining claim is that one binary route is
 * protected by APP1's existing guard, and a stubbed guard would only prove the
 * handler runs once something lets it.
 *
 * Booting the whole `AppModule` also makes the `APP7-B04` handoff a real
 * end-to-end proof rather than a mocked one: the same application answers the
 * payment read that publishes `evidenceId` and the delivery that consumes it.
 *
 * One provider is overridden and only one: `OBJECT_STORAGE`, through the
 * `configure` seam `createApiIntegrationContext` already exposes. The store is
 * the single dependency that is neither the code under test nor the database,
 * and a suite that needed a live MinIO would prove S3 works rather than proving
 * the delivery *decision* does. {@link CountingObjectStorage} is not a stub that
 * returns success: it **counts** its calls, which is what makes the
 * descriptor-before-storage invariant observable at all. A private miss that
 * quietly reached the provider would still return 404 and would still look like
 * a pass without that counter.
 *
 * The asset and association fixtures are raw SQL for the reason
 * `admin-request-asset-context.ts` records: the states B06 refuses are written
 * by pipelines outside this checkpoint (`APP7-B05` intake, `APP2-W01`
 * inspection, the G4 tombstone flow), and a suite that insisted on producing
 * them through those use cases could not test the read at all. Every seeded row
 * satisfies the real constraints. The *payment* chain is not seeded this way:
 * the order, both obligations and the attempt all come from the canonical
 * writers through `seedVerifiableAttempt`.
 *
 * No `.env` file is read, written or consulted (`CLAUDE.md` §8a), and no
 * credential is rotated.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  ObjectStorageError,
  type ObjectReference,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import { sql } from 'drizzle-orm';
import type { Response as SupertestResponse } from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';
import { createAdminPaymentContext, type AdminPaymentTestContext } from './admin-payment-fixture';

/** Real signatures, so the fixtures are the file types they claim to be. */
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  randomBytes(120),
]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(200)]);
export const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF????WEBPVP8 ', 'ascii'),
  randomBytes(64),
]);

/** What the fake store holds for one key. */
interface StoredObject {
  readonly bytes: Buffer;
  /** Overrides the reported size, so a provider/persisted contradiction is reachable. */
  readonly reportedSizeBytes?: number;
  /**
   * Milliseconds between chunks.
   *
   * Only the disconnect proof sets it, and it is the difference between a real
   * proof and a vacuous one: a body Node can flush in a single tick has already
   * *ended* by the time an abort arrives, and `destroyed` is true after a normal
   * end too. A source that trickles is the only way to observe a teardown of a
   * stream that had not finished.
   */
  readonly chunkDelayMs?: number;
}

/**
 * An object store that remembers whether it was asked anything at all.
 *
 * `reads` is the assertion every private-miss case makes: the delivery decision
 * is proved before the provider is touched, so a refused request must leave this
 * counter at zero.
 */
export class CountingObjectStorage implements ObjectStoragePort {
  readonly reads: string[] = [];
  /** The bodies handed out, so a disconnect proof can assert one was torn down. */
  readonly openedBodies: Readable[] = [];
  private readonly objects = new Map<string, StoredObject>();

  put(key: string, object: StoredObject): void {
    this.objects.set(key, object);
  }

  getObjectStream(reference: ObjectReference, signal?: AbortSignal): Promise<ObjectStreamResult> {
    this.reads.push(`${reference.bucket}:${reference.key}`);
    if (signal?.aborted === true) {
      return Promise.reject(new ObjectStorageError('REQUEST_ABORTED', 'aborted'));
    }
    const stored = this.objects.get(reference.key);
    if (stored === undefined) {
      return Promise.reject(new ObjectStorageError('OBJECT_NOT_FOUND', 'no such object'));
    }
    const body = Readable.from(chunk(stored.bytes, stored.chunkDelayMs ?? 0), {
      objectMode: false,
    });
    this.openedBodies.push(body);
    return Promise.resolve({
      bucket: reference.bucket,
      key: reference.key,
      sizeBytes: stored.reportedSizeBytes ?? stored.bytes.length,
      contentType: 'application/octet-stream',
      metadata: {},
      body,
    });
  }

  copyObject(): never {
    throw new Error('APP7-B06 never copies an object.');
  }
  putObjectStream(): never {
    throw new Error('APP7-B06 never writes an object.');
  }
  headObject(): never {
    throw new Error('APP7-B06 never heads an object.');
  }
  deleteObject(): never {
    throw new Error('APP7-B06 never deletes an object.');
  }
  listObjectsByPrefix(): never {
    throw new Error('APP7-B06 never lists objects.');
  }
  async ensurePrivateBuckets(): Promise<void> {
    // The suite provisions nothing; the module never calls this.
  }

  reset(): void {
    this.reads.length = 0;
    this.openedBodies.length = 0;
    this.objects.clear();
  }
}

/**
 * 4 KiB slices.
 *
 * Small enough that a large fixture cannot be delivered in one tick — which is
 * what lets the disconnect proof catch the body *mid*-stream rather than after
 * it ended — and large enough that the ordinary fixtures stay one chunk.
 */
const CHUNK_BYTES = 4_096;

async function* chunk(bytes: Buffer, delayMs: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    yield bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length));
  }
}

export interface EvidenceDeliveryContext {
  readonly admin: AdminPaymentTestContext;
  readonly storage: CountingObjectStorage;
  close(): Promise<void>;
}

/** Boots the application with a counting object store in place of the S3 client. */
export async function createEvidenceDeliveryContext(
  label: string,
): Promise<EvidenceDeliveryContext> {
  const storage = new CountingObjectStorage();
  const admin = await createAdminPaymentContext(label, (builder) =>
    builder.overrideProvider(OBJECT_STORAGE).useValue(storage),
  );
  return { admin, storage, close: () => admin.close() };
}

export interface SeedEvidenceOptions {
  readonly bytes?: Buffer;
  readonly mimeType?: string;
  readonly kind?: string;
  readonly classification?: string;
  readonly status?: string;
  readonly deleted?: boolean;
  /** Persist a size that contradicts what the store reports. */
  readonly persistedSizeBytes?: number;
  /** Register no object at all, so the provider reports it missing. */
  readonly withoutObject?: boolean;
  /** Trickle the object, so a disconnect can be observed mid-stream. */
  readonly chunkDelayMs?: number;
}

export interface SeededEvidence {
  readonly evidenceId: string;
  readonly assetId: string;
  readonly storageKey: string;
  readonly bytes: Buffer;
}

/**
 * One `assets` row in the given state, its stored object, and one
 * `payment_transfer_evidence` association binding it to an attempt.
 *
 * The default lane is `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`, the pair
 * `PAYMENT_EVIDENCE_INTAKE_LANE` writes, because the delivery read filters on
 * exactly that scope — an asset outside it is absent rather than returned, and a
 * fixture that seeded some other kind would silently prove nothing.
 */
export async function seedEvidence(
  database: DisposableDatabase,
  storage: CountingObjectStorage,
  attemptId: string,
  options: SeedEvidenceOptions = {},
): Promise<SeededEvidence> {
  const assetId = newId();
  const evidenceId = newId();
  const bytes = options.bytes ?? PNG_BYTES;
  const storageKey = `test/originals/${assetId}.bin`;
  const { db } = database.client;

  await db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                        checksum, status, deleted_at)
    values (${assetId}, ${options.kind ?? 'CUSTOMER_UPLOAD'},
            ${options.classification ?? 'CUSTOMER_PRIVATE'}, ${storageKey},
            ${options.mimeType ?? 'image/png'},
            ${options.persistedSizeBytes ?? bytes.length},
            ${`sha256:${'a'.repeat(64)}`}, ${options.status ?? 'ACCEPTED'},
            ${options.deleted === true ? new Date() : null})
  `);
  await db.execute(sql`
    insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
    values (${evidenceId}, ${attemptId}, ${assetId})
  `);

  if (options.withoutObject !== true) {
    // The store always reports what it actually holds. A `persistedSizeBytes`
    // that differs from `bytes.length` is therefore a genuine disagreement
    // between the two authorities, not a flag the fake honours.
    storage.put(storageKey, { bytes, chunkDelayMs: options.chunkDelayMs ?? 0 });
  }
  return { evidenceId, assetId, storageKey, bytes };
}

/** The one canonical route, under the global API prefix. */
export function evidenceContentRoute(evidenceId: string): string {
  return `/${GLOBAL_ROUTE_PREFIX}/admin/payment-evidence/${evidenceId}/content`;
}

/**
 * Collects a binary body.
 *
 * Supertest decodes a response as text unless told otherwise, which would
 * silently corrupt every byte an image assertion depends on — a comparison
 * against the stored buffer would then fail for the wrong reason, or worse,
 * pass on a body that had been mangled identically both times.
 */
export function binaryParser(
  response: SupertestResponse,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const stream = response as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (part: Buffer) => chunks.push(Buffer.from(part)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
}
