/**
 * Live harness for the `APP3-W01A` normalization suites.
 *
 * Boots the real production `WorkerModule` — real object-storage client, real
 * startup gate, real handler registration — against a disposable PostgreSQL with
 * every migration and a disposable MinIO. Nothing is stubbed: the derivative
 * that lands in the store is the one a production worker would write, and the
 * rows it leaves behind are constrained by the real CHECKs, the real partial
 * unique index and the real `ck_asset_derivatives__ready_normalized_metadata`.
 *
 * **No producer is required.** `IMP-D046` PO-06 says W01A may be proven by
 * inserting the ruled Outbox event directly, and that is exactly what this
 * harness does — which is also why the consumer can be accepted before
 * `APP3-B01N` exists.
 *
 * Test-only. Build-excluded via `src/**\/tests/**`.
 */
import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
// The sanctioned raw-SQL boundary (ADR-DB1-002): the worker application must
// never depend on the ORM or the driver, not even in a test.
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { WorkerModule } from '../../../bootstrap/worker.module';
import {
  WORKER_RUNTIME_POLICY_KEY,
  WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
  type WorkerRuntimePolicy,
} from '../../../runtime/policy/worker-runtime-policy';
import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import {
  minioEnv,
  startDisposableMinio,
  type DisposableMinio,
} from '../../../../test/support/disposable-minio';
import { AssociationResolutionService } from '../application/association-resolution.service';
import { AssetNormalizationUseCase } from '../application/asset-normalization.usecase';
import { NormalizedDerivativeService } from '../application/normalized-derivative.service';
import { TemplateSvgNormalizationService } from '../application/template-svg-normalization.service';
import {
  ASSET_NORMALIZATION_EVENT_TYPE,
  ASSET_NORMALIZATION_PAYLOAD_VERSION,
  type AssociationRef,
} from '../domain/asset-normalization.payload';
import { NORMALIZATION_POLICY_VERSION } from '../domain/normalization-policy';
import {
  ASSET_NORMALIZATION_REPOSITORY,
  type AssetNormalizationRepository,
} from '../domain/repositories/asset-normalization.repository';
import type { SyntheticImage } from '../../asset-inspection/tests/image-fixtures';

const INTEGRATION_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 250,
  leaseDurationMs: 30_000,
  handlerTimeoutMs: 10_000,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 1_000,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
};

const EXTENSION_BY_MEDIA_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface SeededAsset {
  readonly assetId: string;
  readonly originalKey: string;
}

export interface SeedAssetOverrides {
  readonly status?: string;
  readonly kind?: string;
  readonly classification?: string;
  readonly mediaType?: string;
  readonly checksum?: string | null;
  readonly sizeBytes?: bigint;
  readonly deleted?: boolean;
}

export interface AssetNormalizationContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  readonly minio: DisposableMinio;
  readonly storage: ObjectStoragePort;
  readonly useCase: AssetNormalizationUseCase;
  readonly repository: AssetNormalizationRepository;
  readonly transactions: TransactionManager;
  seedAsset(image: SyntheticImage, overrides?: SeedAssetOverrides): Promise<SeededAsset>;
  /** A published Product with one active Side whose background is `assetId`. */
  seedProductSide(assetId: string, options?: { retired?: boolean }): Promise<string>;
  seedTemplateAssociation(assetId: string, options?: { archived?: boolean }): Promise<string>;
  seedSessionAssociation(assetId: string, options?: { status?: string }): Promise<string>;
  /** Appends the ruled event exactly as a producer would, and returns its id. */
  appendEvent(assetId: string, reference: AssociationRef): Promise<bigint>;
  query<TRow extends Record<string, unknown>>(statement: ReturnType<typeof sql>): Promise<TRow[]>;
  /** A second use case wired to a substituted port or repository — the failure seam. */
  buildUseCase(overrides: {
    readonly storage?: ObjectStoragePort;
    readonly repository?: AssetNormalizationRepository;
  }): AssetNormalizationUseCase;
  close(): Promise<void>;
}

export async function startAssetNormalizationContext(
  label: string,
): Promise<AssetNormalizationContext> {
  const minio = await startDisposableMinio();
  let disposable: DisposableDatabase | undefined;
  const previous = captureEnv();

  try {
    disposable = await createDisposableDatabase(label);
    process.env['DATABASE_URL'] = disposable.url;
    process.env['NODE_ENV'] = 'test';
    for (const [name, value] of Object.entries(minioEnv(minio))) {
      process.env[name] = value;
    }

    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await publishPolicy(moduleRef, disposable);
    await moduleRef.init();

    const owned = disposable;
    const storage = moduleRef.get<ObjectStoragePort>(OBJECT_STORAGE);
    const repository = moduleRef.get<AssetNormalizationRepository>(ASSET_NORMALIZATION_REPOSITORY);
    const transactions = moduleRef.get(TransactionManager);
    const query = async <TRow extends Record<string, unknown>>(statement: ReturnType<typeof sql>) =>
      (await executeRaw<TRow>(owned.client.db, statement)) as TRow[];

    return {
      moduleRef,
      disposable: owned,
      minio,
      storage,
      repository,
      transactions,
      useCase: moduleRef.get(AssetNormalizationUseCase),
      buildUseCase: (overrides): AssetNormalizationUseCase => {
        const port = overrides.storage ?? storage;
        const repo = overrides.repository ?? repository;
        return new AssetNormalizationUseCase(
          transactions,
          repo,
          new AssociationResolutionService(repo),
          new NormalizedDerivativeService(port, 'test'),
          new TemplateSvgNormalizationService(port, 'test'),
        );
      },
      seedAsset: (image, overrides = {}) => seedAsset(owned, storage, image, overrides),
      seedProductSide: (assetId, options = {}) => seedProductSide(owned, assetId, options),
      seedTemplateAssociation: (assetId, options = {}) =>
        seedTemplateAssociation(owned, assetId, options),
      seedSessionAssociation: (assetId, options = {}) =>
        seedSessionAssociation(owned, assetId, options),
      appendEvent: (assetId, reference) => appendEvent(owned, assetId, reference),
      query,
      close: async (): Promise<void> => {
        await moduleRef.close();
        await owned.drop();
        await minio.stop();
        restoreEnv(previous);
      },
    };
  } catch (error: unknown) {
    await disposable?.drop();
    await minio.stop();
    restoreEnv(previous);
    throw error;
  }
}

/**
 * Writes an `ACCEPTED` Asset and puts its private original where the row says.
 *
 * `ACCEPTED` rather than `INSPECTING`: normalization presupposes a completed
 * inspection, so seeding anything else would be seeding a state this consumer is
 * supposed to refuse.
 */
async function seedAsset(
  disposable: DisposableDatabase,
  storage: ObjectStoragePort,
  image: SyntheticImage,
  overrides: SeedAssetOverrides,
): Promise<SeededAsset> {
  const assetId = newId();
  const mediaType = overrides.mediaType ?? image.mediaType;
  const extension = EXTENSION_BY_MEDIA_TYPE[image.mediaType] ?? 'png';
  const originalKey = `test/originals/${assetId}/original.${extension}`;

  await storage.putObjectStream({
    bucket: 'ORIGINALS',
    key: originalKey,
    body: Readable.from([image.bytes]),
    contentType: image.mediaType,
  });

  await executeRaw(
    disposable.client.db,
    sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                            checksum, status, deleted_at)
        values (${assetId}, ${overrides.kind ?? 'CATALOG_MEDIA'},
                ${overrides.classification ?? 'PRODUCTION_SENSITIVE'}, ${originalKey},
                ${mediaType}, ${(overrides.sizeBytes ?? BigInt(image.byteSize)).toString()},
                ${overrides.checksum === undefined ? image.checksum : overrides.checksum},
                ${overrides.status ?? 'ACCEPTED'},
                ${overrides.deleted === true ? new Date() : null})`,
  );

  return { assetId, originalKey };
}

/** A category, a published Product and one Side whose background is `assetId`. */
async function seedProductSide(
  disposable: DisposableDatabase,
  assetId: string,
  options: { retired?: boolean },
): Promise<string> {
  const suffix = newId().slice(-8);
  const categoryId = newId();
  const productId = newId();
  const sideId = newId();

  await executeRaw(
    disposable.client.db,
    sql`insert into categories (id, name, slug, status, display_order, is_indexable)
        values (${categoryId}, ${`Danh mục ${suffix}`}, ${`danh-muc-${suffix}`}, 'PUBLISHED', 0, true)`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                             status, is_display_out_of_stock, display_order, is_indexable)
        values (${productId}, ${categoryId}, ${`Sản phẩm ${suffix}`}, ${`san-pham-${suffix}`},
                '250000', 'VND', 'PUBLISHED', false, 0, true)`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into product_sides (id, product_id, code, name, background_asset_id,
                                   image_width_px, image_height_px, physical_width_mm,
                                   physical_height_mm, px_per_mm, display_order, retired_at)
        values (${sideId}, ${productId}, 'front', 'Mặt trước', ${assetId}, 1000, 1000,
                '200', '200', '5', 0, ${options.retired === true ? new Date() : null})`,
  );
  return sideId;
}

async function seedTemplateAssociation(
  disposable: DisposableDatabase,
  assetId: string,
  options: { archived?: boolean },
): Promise<string> {
  const suffix = newId().slice(-8);
  const templateId = newId();
  const associationId = newId();

  await executeRaw(
    disposable.client.db,
    sql`insert into design_templates (id, name, slug, status, current_version, archived_at)
        values (${templateId}, ${`Mẫu ${suffix}`}, ${`mau-${suffix}`}, 'DRAFT', 1,
                ${options.archived === true ? new Date() : null})`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into design_template_assets (id, design_template_id, asset_id)
        values (${associationId}, ${templateId}, ${assetId})`,
  );
  return associationId;
}

/**
 * A Session and its asset association.
 *
 * `design_sessions` requires a whole Product → Side → Area chain, so the session
 * seed builds one: the association cannot exist without a Session, and a Session
 * cannot exist without the placement it is designing on.
 */
async function seedSessionAssociation(
  disposable: DisposableDatabase,
  assetId: string,
  options: { status?: string },
): Promise<string> {
  const suffix = newId().slice(-8);
  const categoryId = newId();
  const productId = newId();
  const sideId = newId();
  const areaId = newId();
  const sessionId = newId();
  const associationId = newId();
  const backgroundId = newId();

  await executeRaw(
    disposable.client.db,
    sql`insert into categories (id, name, slug, status, display_order, is_indexable)
        values (${categoryId}, ${`Danh mục ${suffix}`}, ${`danh-muc-${suffix}`}, 'PUBLISHED', 0, true)`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                             status, is_display_out_of_stock, display_order, is_indexable)
        values (${productId}, ${categoryId}, ${`Sản phẩm ${suffix}`}, ${`san-pham-${suffix}`},
                '250000', 'VND', 'PUBLISHED', false, 0, true)`,
  );
  // The Side needs its own background Asset; the session upload is a different
  // Asset entirely, which is exactly the separation this seed has to preserve.
  await executeRaw(
    disposable.client.db,
    sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
        values (${backgroundId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
                ${`test/originals/${backgroundId}/original.png`}, 'image/png', 1024, 'ACCEPTED')`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into product_sides (id, product_id, code, name, background_asset_id,
                                   image_width_px, image_height_px, physical_width_mm,
                                   physical_height_mm, px_per_mm, display_order)
        values (${sideId}, ${productId}, 'front', 'Mặt trước', ${backgroundId}, 1000, 1000,
                '200', '200', '5', 0)`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into embroidery_areas (id, product_side_id, code, name, bound_x_px, bound_y_px,
                                      bound_width_px, bound_height_px, display_order)
        values (${areaId}, ${sideId}, 'chest', 'Ngực', '100', '100', '400', '300', 0)`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                     embroidery_area_id, design_document, document_schema_version,
                                     autosave_revision, status, expires_at, last_activity_at)
        values (${sessionId}, ${`hash-${suffix}`}, ${productId}, ${sideId}, ${areaId},
                '{}'::jsonb, 1, 0, ${options.status ?? 'ACTIVE'},
                now() + interval '30 days', now())`,
  );
  await executeRaw(
    disposable.client.db,
    sql`insert into design_session_assets (id, session_id, asset_id)
        values (${associationId}, ${sessionId}, ${assetId})`,
  );
  return associationId;
}

/** The ruled event, appended exactly as a producer's transaction would. */
async function appendEvent(
  disposable: DisposableDatabase,
  assetId: string,
  reference: AssociationRef,
): Promise<bigint> {
  const payload = {
    schemaVersion: ASSET_NORMALIZATION_PAYLOAD_VERSION,
    assetId,
    normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
    associationRef: reference,
  };
  const [row] = await executeRaw<{ id: string }>(
    disposable.client.db,
    sql`insert into outbox_events (event_type, aggregate_kind, aggregate_id, payload,
                                   payload_schema_version, status, attempt_count)
        values (${ASSET_NORMALIZATION_EVENT_TYPE}, 'ASSET', ${assetId},
                ${JSON.stringify(payload)}::jsonb, ${ASSET_NORMALIZATION_PAYLOAD_VERSION},
                'PENDING', 0)
        returning id`,
  );
  return BigInt(row?.id ?? '0');
}

/** The same publication path the APP2 harness uses; the policy is operator data. */
async function publishPolicy(
  moduleRef: TestingModule,
  disposable: DisposableDatabase,
): Promise<void> {
  const adminId = newId();
  await executeRaw(
    disposable.client.db,
    sql`insert into admin_accounts (id, email, display_name, status)
        values (${adminId}, ${`w01a-${adminId}@example.com`}, 'W01A Fixture', 'ACTIVE')`,
  );

  const policies = moduleRef.get(PolicyConfigurationRepository);
  await moduleRef.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(WORKER_RUNTIME_POLICY_KEY, 'Worker runtime policy (APP2-I02).');
    await policies.publishVersion({
      configKey: WORKER_RUNTIME_POLICY_KEY,
      value: { ...INTEGRATION_POLICY },
      valueSchemaVersion: WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP3-W01A integration fixture.',
    });
  });
}

const ENV_KEYS = [
  'DATABASE_URL',
  'NODE_ENV',
  'OBJECT_STORAGE_PROVIDER',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_FORCE_PATH_STYLE',
  'OBJECT_STORAGE_ORIGINALS_BUCKET',
  'OBJECT_STORAGE_DERIVATIVES_BUCKET',
];

function captureEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
