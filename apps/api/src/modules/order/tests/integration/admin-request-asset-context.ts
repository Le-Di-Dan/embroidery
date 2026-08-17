/**
 * Shared harness for the `APP5-B06` Admin request-asset delivery suite.
 *
 * Boots the real `CustomRequestAssetDeliveryModule` over real HTTP against a
 * disposable PostgreSQL with every migration applied, and **overrides no
 * guard**. B06's defining claim is that one binary route is protected by APP1's
 * existing `AuthenticatedAdminGuard`, and a stubbed guard would only prove the
 * handler runs once something lets it. The authenticated cases present a real
 * session cookie against a real `admin_sessions` row; the refused ones send
 * none, and are refused by the code path production uses.
 *
 * One provider is overridden and only one: `OBJECT_STORAGE`. The store is the
 * single dependency that is neither the code under test nor the database, and a
 * suite that needed a live MinIO would prove S3 works rather than proving the
 * delivery decision does — and would move this file out of the Docker-free
 * default config. {@link ReadingObjectStorage} is not a stub that returns
 * success: it **counts** its calls, which is what makes the
 * descriptor-before-storage invariant observable at all. A private miss that
 * quietly reached the provider would still return 404 and would still look like
 * a pass without that counter.
 *
 * The fixtures are raw SQL for the reason `admin-request-context.ts` records:
 * the states B06 refuses are written by pipelines outside this checkpoint
 * (`APP5-B02` intake, `APP2-W01` inspection, the G4 tombstone flow), and a suite
 * that insisted on producing them through those use cases could not test the
 * read at all. Every seeded row satisfies the real constraints.
 *
 * The peppers and the envelope key are synthetic values generated per run. No
 * `.env` file is read, written or consulted (`CLAUDE.md` §8a), and no credential
 * is rotated.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { Readable } from 'node:stream';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import { createDisposableDatabase, truncateAllTables } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import {
  ObjectStorageError,
  type ObjectReference,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import { sql } from 'drizzle-orm';
import type { Response as SupertestResponse } from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { ValidationModule } from '../../../../platform/validation/validation.module';
import { hashToken } from '../../../identity/infrastructure/crypto/session-token.service';
import { OBJECT_STORAGE } from '../../../asset/infrastructure/storage/object-storage.provider';
import { CustomRequestAdminModule } from '../../custom-request-admin.module';
import { CustomRequestAssetDeliveryModule } from '../../custom-request-asset-delivery.module';

/** The development cookie name (`cookieSecure` is false outside production). */
export const ADMIN_COOKIE_NAME = 'adm_session';

/** Non-connecting values, so the module's fail-fast config load succeeds. */
const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app5-b06-offline.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app5-b06-offline',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app5-b06-offline',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app5-b06-offline-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app5-b06-offline-derivatives',
};

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
 * counter at zero. `openedBodies` keeps the streams it handed out, so a
 * disconnect proof can assert the upstream body was destroyed rather than left
 * draining.
 */
export class ReadingObjectStorage implements ObjectStoragePort {
  readonly reads: string[] = [];
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
    // Chunked, so a disconnect has somewhere to land mid-stream instead of the
    // whole body arriving in one synchronous push.
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

  putObjectStream(): never {
    throw new Error('APP5-B06 never writes an object.');
  }
  headObject(): never {
    throw new Error('APP5-B06 never heads an object.');
  }
  deleteObject(): never {
    throw new Error('APP5-B06 never deletes an object.');
  }
  listObjectsByPrefix(): never {
    throw new Error('APP5-B06 never lists objects.');
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
 * Small enough that a multi-megabyte fixture cannot be delivered in one tick —
 * which is what lets the disconnect proof catch the body *mid*-stream rather
 * than after it ended — and large enough that the ordinary fixtures stay one or
 * two chunks.
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

export interface SeedAssetOptions {
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

export interface SeededAsset {
  readonly assetId: string;
  readonly storageKey: string;
  readonly bytes: Buffer;
}

export interface AdminRequestAssetTestContext {
  readonly app: INestApplication;
  readonly storage: ReadingObjectStorage;
  /** The disposable database, for the zero-write snapshot and for seeding. */
  readonly db: DisposableDatabase['client']['db'];
  readonly server: () => Server;
  readonly adminCookie: () => string;
  reset(): Promise<void>;
  seedAdminSession(): Promise<string>;
  seedCustomer(): Promise<string>;
  seedRequest(customerId: string, status?: string): Promise<string>;
  /** One `assets` row, its stored object, and nothing else. */
  seedAsset(customerId: string, options?: SeedAssetOptions): Promise<SeededAsset>;
  /** One TBL-040 association, as `APP5-B01`'s binder writes it. */
  bindAsset(requestId: string, assetId: string, role: string): Promise<void>;
  close(): Promise<void>;
}

export interface AdminRequestAssetContextOptions {
  /**
   * Also boot `APP5-B04`'s read model, for the one handoff proof.
   *
   * Off by default: the delivery suite must exercise B06's module exactly as the
   * application composes it, and a harness that always dragged the queue and
   * detail queries in would let a missing provider in the delivery module go
   * unnoticed. The handoff spec opts in because its whole claim is that a B04
   * `assetId` is usable at the B06 address.
   */
  readonly withAdminReadModel?: boolean;
}

export async function createAdminRequestAssetContext(
  label: string,
  options: AdminRequestAssetContextOptions = {},
): Promise<AdminRequestAssetTestContext> {
  const previous = new Map<string, string | undefined>();
  const remember = (name: string, value: string): void => {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  };

  const disposable = await createDisposableDatabase(label);
  remember('DATABASE_URL', disposable.url);
  remember('NODE_ENV', 'test');
  remember(NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV, randomBytes(32).toString('base64'));
  for (const [name, value] of Object.entries(OFFLINE_STORAGE_ENV)) {
    remember(name, value);
  }

  const storage = new ReadingObjectStorage();
  let app: INestApplication;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RequestContextModule,
        AuditContextModule,
        ValidationModule,
        HttpResponseModule,
        CustomRequestAssetDeliveryModule,
        ...(options.withAdminReadModel === true ? [CustomRequestAdminModule] : []),
      ],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  } catch (error: unknown) {
    await disposable.drop();
    throw error;
  }

  const db = disposable.client.db;
  let cookie = '';

  const seedAdminSession = async (): Promise<string> => {
    const adminId = newId();
    // `uq_admin_accounts__status__active` permits one ACTIVE account, so the
    // suite mints exactly one per reset.
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b06-${adminId}@example.test`}, 'B06 Operator', 'ACTIVE')
    `);
    // A real 256-bit token, hashed exactly as `SessionTokenService` does, so the
    // guard performs its production lookup. The raw value never leaves this
    // process and is written nowhere but the request header.
    const rawToken = randomBytes(32).toString('base64url');
    await db.execute(sql`
      insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
      values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
              ${new Date(Date.now() + 30 * 60 * 1_000)})
    `);
    cookie = `${ADMIN_COOKIE_NAME}=${rawToken}`;
    return cookie;
  };

  const seedCustomer = async (): Promise<string> => {
    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Nguyễn Sáu', '2026-08-14T09:00:00.000Z')
    `);
    return customerId;
  };

  const seedRequest = async (customerId: string, status = 'NEW'): Promise<string> => {
    const requestId = newId();
    // Random rather than derived from the id: `newId()` is UUIDv7, so two rows
    // created in the same millisecond share their leading characters.
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${requestId}, ${code}, ${customerId}, ${status})
    `);
    return requestId;
  };

  const seedAsset = async (
    customerId: string,
    options: SeedAssetOptions = {},
  ): Promise<SeededAsset> => {
    const assetId = newId();
    const bytes = options.bytes ?? PNG_BYTES;
    const storageKey = `test/originals/${assetId}.bin`;
    const status = options.status ?? 'ACCEPTED';
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                          checksum, status, uploaded_by_customer_id, deleted_at)
      values (${assetId}, ${options.kind ?? 'CUSTOMER_UPLOAD'},
              ${options.classification ?? 'CUSTOMER_PRIVATE'}, ${storageKey},
              ${options.mimeType ?? 'image/png'},
              ${options.persistedSizeBytes ?? bytes.length},
              ${`sha256:${'a'.repeat(64)}`}, ${status}, ${customerId},
              ${options.deleted === true ? new Date() : null})
    `);
    if (options.withoutObject !== true) {
      storage.put(storageKey, { bytes, chunkDelayMs: options.chunkDelayMs ?? 0 });
    }
    return { assetId, storageKey, bytes };
  };

  const bindAsset = async (requestId: string, assetId: string, role: string): Promise<void> => {
    await db.execute(sql`
      insert into custom_request_assets (id, custom_request_id, asset_id, role)
      values (${newId()}, ${requestId}, ${assetId}, ${role})
    `);
  };

  return {
    app,
    storage,
    db,
    server: () => app.getHttpServer() as Server,
    adminCookie: () => cookie,
    reset: async () => {
      await truncateAllTables(db);
      storage.reset();
      cookie = '';
    },
    seedAdminSession,
    seedCustomer,
    seedRequest,
    seedAsset,
    bindAsset,
    close: async () => {
      await app.close();
      await disposable.drop();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };
}

/** The one canonical route, under the global API prefix. */
export function contentRoute(requestId: string, assetId: string): string {
  return `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/assets/${assetId}/content`;
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
