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
  close(): Promise<void>;
}

export interface SeedSessionOptions {
  readonly secret?: string;
  readonly status?: string;
  readonly expiresIn?: string;
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

export { DESIGN_SESSION_TEST_ORIGIN };
