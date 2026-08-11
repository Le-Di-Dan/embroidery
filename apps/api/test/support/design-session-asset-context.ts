/**
 * The live Session-upload harness (`APP3-B06B-C1`).
 *
 * `APP3-B06B` proved its durable claims structurally — against the real source
 * and the really-generated contract — but never against a running PostgreSQL.
 * This is what closes that: the real `AppModule` over a disposable, fully
 * migrated database and a disposable MinIO, driven through real HTTP multipart.
 *
 * No second harness is introduced. `createApiIntegrationContext` already
 * documents that a caller may install real object-storage configuration before
 * booting, and `startDisposableMinio` is the accepted `APP2-B01` container
 * helper; this file only composes the two and adds the fixture chain a Session
 * needs. Nothing here touches the development stack or its database.
 */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

import { sql } from '@embroidery/database';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';
import { DesignSessionSecretVerifier } from '../../src/modules/design/infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionRateLimiter } from '../../src/modules/design/infrastructure/rate-limit/design-session-rate-limiter';
import {
  createApiIntegrationContext,
  DESIGN_SESSION_TEST_ORIGIN,
  type ApiIntegrationTestContext,
} from './api-integration-context';
import { minioEnv, startDisposableMinio, type DisposableMinio } from './disposable-minio';

/** Every seeded session gets its own secret: `session_secret_hash` is UNIQUE. */
const SESSION_COOKIE_PREFIX = '__Host-nettheu_ds_';

/** Editor-safe derivatives live here. Private originals are never served. */
const DERIVATIVES_BUCKET = 'DERIVATIVES' as const;

export interface SessionAssetTestContext {
  readonly api: ApiIntegrationTestContext;
  readonly minio: DisposableMinio;
  readonly storage: ObjectStoragePort;
  readonly limiter: DesignSessionRateLimiter;
  /** Rows of one statement against the disposable database. */
  rows<T>(statement: ReturnType<typeof sql>): Promise<T[]>;
  /** Seeds a placement chain plus one session; returns its id. */
  seedSession(options?: SeedSessionOptions): Promise<string>;
  /** The `Cookie` header proving ownership of a seeded session. */
  cookieFor(sessionId: string, secret?: string): string;
  /** Seeds one already-normalized upload owned by `sessionId` (`APP3-B06C`). */
  seedUpload(sessionId: string, options?: SeedUploadOptions): Promise<SeededUpload>;
  /** Deletes a derivative object, leaving its row behind. */
  removeObject(storageKey: string): Promise<void>;
  /** Replaces a session's persisted document elements (`APP3-S06` clone grant). */
  setDocumentElements(sessionId: string, elements: readonly unknown[]): Promise<void>;
  close(): Promise<void>;
}

/** The delivery address of one Session-owned upload. */
export function editorPreviewPath(sessionId: string, assetId: string): string {
  return `/api/public/design-sessions/${sessionId}/assets/${assetId}/editor-preview`;
}

/** The processing-status address of one Session-owned upload (`APP3-S06`). */
export function assetStatusPath(sessionId: string, assetId: string): string {
  return `/api/public/design-sessions/${sessionId}/assets/${assetId}/status`;
}

/**
 * One image element, as a persisted Session document would carry it.
 *
 * The document-reference grant reads `type`, `assetId` and `derivativeId` and
 * nothing else, so this carries exactly those plus enough shape to be a
 * recognisable element. It is written straight into `design_document` because
 * what is under test is the *grant*, not the save path — `APP3-B08` owns that,
 * and going through it would prove the allowlist rather than the read.
 */
export function imageElement(assetId: string, derivativeId: string): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    assetId,
    derivativeId,
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 0, y: 0, width: 100, height: 75, rotationDeg: 0 },
  };
}

export interface SeedSessionOptions {
  readonly secret?: string;
  readonly status?: string;
  readonly expiresIn?: string;
}

/**
 * How an already-normalized Session upload should be seeded (`APP3-B06C`).
 *
 * Every field defaults to the shape `APP3-B06B` + `APP3-W01A` actually produce —
 * a `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` asset that inspection accepted, with one
 * `READY`, unwatermarked `NORMALIZED` derivative carrying the whole `APP3-DB01`
 * quartet. Each override exists so a delivery test can break exactly one term and
 * watch the answer stay the same, which is the only way to prove the misses are
 * indistinguishable.
 */
export interface SeedUploadOptions {
  readonly bytes?: Buffer;
  readonly assetKind?: string;
  readonly classification?: string;
  readonly assetStatus?: string;
  readonly deleted?: boolean;
  readonly derivativeKind?: string | null;
  readonly derivativeStatus?: string;
  readonly watermarked?: boolean;
  readonly mediaType?: string;
  /** Drops the quartet, leaving a row that is `READY` but not fully described. */
  readonly incompleteQuartet?: boolean;
  /** Records a size the object will not have, to force the reconciliation refusal. */
  readonly recordedByteSize?: number;
  /** Skips the association row entirely. */
  readonly associate?: boolean;
  /** Associates with this session instead of the one being seeded against. */
  readonly associateWith?: string;
  /** Skips writing the object, leaving an authorized descriptor with no bytes. */
  readonly writeObject?: boolean;
}

export interface SeededUpload {
  readonly assetId: string;
  /**
   * The derivative row's own id.
   *
   * Needed by `APP3-S06`: the document-reference grant matches the **pair**, so
   * a test proving that an image referenced through the wrong derivative is
   * refused has to be able to name the right one.
   */
  readonly derivativeId: string | null;
  readonly storageKey: string;
  readonly bytes: Buffer;
  readonly path: string;
}

export async function createSessionAssetContext(label: string): Promise<SessionAssetTestContext> {
  const minio = await startDisposableMinio();
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(minioEnv(minio))) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  let api: ApiIntegrationTestContext;
  try {
    api = await createApiIntegrationContext(label);
  } catch (error: unknown) {
    await minio.stop();
    restore(previous);
    throw error;
  }

  const storage = api.app.get<ObjectStoragePort>(OBJECT_STORAGE);
  // The adapter creates them idempotently and private-only; without this the
  // first upload would fail on a missing bucket rather than on behaviour.
  await storage.ensurePrivateBuckets();

  const verifier = api.app.get(DesignSessionSecretVerifier);
  const secrets = new Map<string, string>();

  const exec = (statement: ReturnType<typeof sql>) => api.database.client.db.execute(statement);
  const rows = async <T>(statement: ReturnType<typeof sql>): Promise<T[]> =>
    (await exec(statement)).rows as T[];

  return {
    api,
    minio,
    storage,
    limiter: api.app.get(DesignSessionRateLimiter),
    rows,
    seedSession: async (options: SeedSessionOptions = {}): Promise<string> => {
      const secret = options.secret ?? randomBytes(32).toString('base64url');
      const id = await seedChain(exec, verifier.digest(secret), options);
      secrets.set(id, secret);
      return id;
    },
    cookieFor: (sessionId: string, secret?: string): string =>
      `${SESSION_COOKIE_PREFIX}${sessionId}=${secret ?? secrets.get(sessionId) ?? 'unknown'}`,
    seedUpload: (sessionId: string, options: SeedUploadOptions = {}) =>
      seedUpload(exec, storage, sessionId, options),
    removeObject: (storageKey: string) =>
      storage.deleteObject({ bucket: DERIVATIVES_BUCKET, key: storageKey }),
    setDocumentElements: async (sessionId: string, elements: readonly unknown[]): Promise<void> => {
      await exec(sql`
        update design_sessions
           set design_document = jsonb_set(design_document, '{elements}',
                                           ${JSON.stringify(elements)}::jsonb, true)
         where id = ${sessionId}`);
    },
    close: async () => {
      await api.close();
      await minio.stop();
      restore(previous);
    },
  };
}

function restore(previous: Map<string, string | undefined>): void {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/**
 * A Product → Side → Area chain plus one session, inserted directly.
 *
 * Direct SQL rather than the publication services, exactly as the accepted
 * `APP3-B06A` suite seeds: this suite is about what an upload writes, and
 * routing every fixture through three application services would make a
 * failure in one of them read as a failure here.
 */
async function seedChain(
  exec: (statement: ReturnType<typeof sql>) => Promise<unknown>,
  secretDigest: string,
  options: SeedSessionOptions,
): Promise<string> {
  const ids = {
    asset: crypto.randomUUID(),
    category: crypto.randomUUID(),
    product: crypto.randomUUID(),
    side: crypto.randomUUID(),
    area: crypto.randomUUID(),
    session: crypto.randomUUID(),
  };
  await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        values (${ids.asset}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${ids.asset}.png`},
                'image/png', 1024, 'ACCEPTED')`);
  await exec(sql`insert into categories (id, name, slug, status, display_order, is_indexable)
        values (${ids.category}, 'Fixture', ${`c-${ids.category}`}, 'PUBLISHED', 1, true)`);
  await exec(sql`insert into products
          (id, category_id, name, slug, base_price_amount, currency_code, status,
           is_display_out_of_stock, display_order, is_indexable)
        values (${ids.product}, ${ids.category}, 'Fixture Tee', ${`t-${ids.product}`}, 150000,
                'VND', 'PUBLISHED', false, 1, true)`);
  await exec(sql`insert into product_sides
          (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
           physical_width_mm, physical_height_mm, px_per_mm, display_order)
        values (${ids.side}, ${ids.product}, 'front', 'Front', ${ids.asset}, 1000, 1200, 400, 480, 2.5, 1)`);
  await exec(sql`insert into embroidery_areas
          (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
           bound_height_px, display_order)
        values (${ids.area}, ${ids.side}, 'chest', 'Chest', 100, 150, 300, 200, 1)`);
  await exec(sql`insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                     embroidery_area_id, design_document, document_schema_version,
                                     autosave_revision, status, expires_at, last_activity_at)
        values (${ids.session}, ${secretDigest}, ${ids.product},
                ${ids.side}, ${ids.area}, '{}'::jsonb, 1, 0, ${options.status ?? 'ACTIVE'},
                now() + cast(${options.expiresIn ?? '30 days'} as interval), now())`);
  return ids.session;
}

/**
 * Seeds one Session upload in the state `APP3-B06B` + `APP3-W01A` leave behind.
 *
 * Direct SQL for the same reason `seedChain` uses it: this is *setup* for a
 * delivery test, and routing it through the intake service and the worker would
 * make a failure in either read as a delivery failure. The shape is pinned to
 * what those two really produce, and the accepted intake suite is what proves
 * they produce it.
 *
 * The object is written last, so a fixture that skips it leaves a fully
 * authorized descriptor pointing at nothing — which is exactly the provider
 * contradiction the 503 taxonomy exists for.
 */
async function seedUpload(
  exec: (statement: ReturnType<typeof sql>) => Promise<unknown>,
  storage: ObjectStoragePort,
  sessionId: string,
  options: SeedUploadOptions,
): Promise<SeededUpload> {
  const assetId = crypto.randomUUID();
  const bytes = options.bytes ?? Buffer.from(`SESSION-UPLOAD-${assetId}-`.repeat(24), 'utf8');
  const storageKey = `development/derivatives/${assetId}/NORMALIZED.webp`;
  const mediaType = options.mediaType ?? 'image/webp';

  await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                                     status, deleted_at)
        values (${assetId}, ${options.assetKind ?? 'CUSTOMER_UPLOAD'},
                ${options.classification ?? 'CUSTOMER_PRIVATE'},
                ${`sessions/${assetId}/original.png`}, 'image/png', ${bytes.length},
                ${options.assetStatus ?? 'ACCEPTED'},
                ${options.deleted === true ? sql`now()` : null})`);

  if (options.associate !== false) {
    await exec(sql`insert into design_session_assets (id, session_id, asset_id)
          values (${crypto.randomUUID()}, ${options.associateWith ?? sessionId}, ${assetId})`);
  }

  const derivativeId = options.derivativeKind === null ? null : crypto.randomUUID();
  if (derivativeId !== null) {
    const complete = options.incompleteQuartet !== true;
    await exec(sql`insert into asset_derivatives (id, asset_id, kind, status, storage_key,
                                                  is_watermarked, width_px, height_px, media_type,
                                                  byte_size)
          values (${derivativeId}, ${assetId}, ${options.derivativeKind ?? 'NORMALIZED'},
                  ${options.derivativeStatus ?? 'READY'}, ${storageKey},
                  ${options.watermarked ?? false},
                  ${complete ? 800 : null}, ${complete ? 600 : null},
                  ${complete ? mediaType : null},
                  ${complete ? (options.recordedByteSize ?? bytes.length) : null})`);
  }

  if (options.writeObject !== false) {
    await storage.putObjectStream({
      bucket: DERIVATIVES_BUCKET,
      key: storageKey,
      body: Readable.from([bytes]),
      contentType: mediaType,
      contentLengthBytes: bytes.length,
    });
  }

  return { assetId, derivativeId, storageKey, bytes, path: editorPreviewPath(sessionId, assetId) };
}

export { DESIGN_SESSION_TEST_ORIGIN };
