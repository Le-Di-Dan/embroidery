/**
 * Live-database fixtures for the `APP2-B03` publication suites.
 *
 * Everything here builds *real* rows through the real seams wherever one
 * exists — products come from `ProductDraftService`, so a fixture can never
 * create a product the delivered API could not. Assets and their derivatives
 * have no Admin write path in APP2 (the worker owns them), so those are seeded
 * with explicit SQL, which is also the only way to reproduce the states this
 * suite must prove readiness rejects.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import { RequestContextService } from '../../src/platform/request-context/request-context.service';
import type { ApiIntegrationTestContext } from './api-integration-context';

/** A synthetic, non-secret Admin identity for fixture attribution. */
export const FIXTURE_ADMIN_EMAIL = 'publication@example.test';
export const FIXTURE_ADMIN_PASSWORD = 'operator-secret-123';

export interface SeededAssetOptions {
  readonly status?: string;
  readonly kind?: string;
  readonly classification?: string;
  readonly deleted?: boolean;
  /** Derivative kinds to create as `READY`; defaults to both required kinds. */
  readonly readyDerivatives?: readonly string[];
  /** Derivative kinds to create in a non-ready state. */
  readonly pendingDerivatives?: readonly string[];
  /** Derivative kinds to create `READY` but watermarked. */
  readonly watermarkedDerivatives?: readonly string[];
}

/**
 * Seeds one catalog-media asset with the derivatives the worker would have
 * produced, and returns its id.
 */
export async function seedAsset(
  ctx: ApiIntegrationTestContext,
  options: SeededAssetOptions = {},
): Promise<string> {
  const id = newId();
  const kind = options.kind ?? 'CATALOG_MEDIA';
  const classification = options.classification ?? 'PRODUCTION_SENSITIVE';
  const status = options.status ?? 'ACCEPTED';

  await ctx.database.client.db.execute(sql`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum,
                        status, deleted_at)
    values (${id}, ${kind}, ${classification},
            ${`development/originals/${id}/original.png`}, 'image/png', 51200,
            ${`sha256:${'e'.repeat(64)}`}, ${status},
            ${options.deleted === true ? sql`now()` : null})
  `);

  const ready = options.readyDerivatives ?? ['THUMBNAIL', 'CATALOG_PREVIEW'];
  for (const derivativeKind of ready) {
    await insertDerivative(ctx, id, derivativeKind, 'READY', false);
  }
  for (const derivativeKind of options.pendingDerivatives ?? []) {
    await insertDerivative(ctx, id, derivativeKind, 'PENDING', false);
  }
  for (const derivativeKind of options.watermarkedDerivatives ?? []) {
    // Only `PREVIEW_WATERMARKED` may carry a watermark under CST-126, so a
    // watermarked catalog derivative is seeded as that kind — which is also
    // exactly why it must not satisfy a catalog requirement.
    await insertDerivative(ctx, id, derivativeKind, 'READY', true);
  }
  return id;
}

async function insertDerivative(
  ctx: ApiIntegrationTestContext,
  assetId: string,
  kind: string,
  status: string,
  isWatermarked: boolean,
): Promise<void> {
  await ctx.database.client.db.execute(sql`
    insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
    values (${newId()}, ${assetId}, ${kind}, ${status},
            ${status === 'READY' ? `development/derivatives/${assetId}/${kind}.webp` : null},
            ${isWatermarked})
  `);
}

let seedCounter = 0;

/** A short, collision-free suffix for fixture product names. */
function nextSeedSuffix(): string {
  seedCounter += 1;
  return `${seedCounter}-${newId().slice(-6)}`;
}

export interface SeededProduct {
  readonly productId: string;
  readonly updatedAt: string;
  readonly assetIds: readonly string[];
}

/**
 * Creates a DRAFT that satisfies every publication requirement.
 *
 * `overrides` deliberately omit a field rather than blank it where the API has
 * no way to blank it: a draft with no price simply never receives one, which is
 * the state IMP-D032's `0` sentinel actually produces.
 */
export async function seedPublishableProduct(
  ctx: ApiIntegrationTestContext,
  overrides: {
    readonly name?: string;
    readonly description?: string | undefined;
    readonly basePriceAmount?: string | undefined;
    readonly mediaAssetIds?: readonly string[] | undefined;
    readonly categorySlug?: string;
  } = {},
): Promise<SeededProduct> {
  const drafts = ctx.app.get(ProductDraftService);
  const created = await drafts.create({
    categorySlug: overrides.categorySlug ?? 'thu-bong',
    // Unique per seed. The slug is derived from the name and is globally unique
    // across every lifecycle state, and the create seam allows exactly one
    // id-derived fallback — so a suite that seeded three products under one
    // name would fail on the third with `PRODUCT_SLUG_CONFLICT`, for a reason
    // that has nothing to do with what it was testing.
    name: overrides.name ?? `Gấu bông thỏ trắng ${nextSeedSuffix()}`,
    // Key **presence**, not value, decides an override. `{ description:
    // undefined }` is how a caller asks for a draft with no description, and
    // testing the value instead would silently hand it the default — a fixture
    // that quietly builds a publishable product for a test asserting the
    // opposite.
    ...('description' in overrides
      ? { description: overrides.description }
      : { description: 'Gấu bông thêu tay, chất liệu bông mềm.' }),
  });

  const assetIds =
    'mediaAssetIds' in overrides
      ? (overrides.mediaAssetIds ?? [])
      : [await seedAsset(ctx), await seedAsset(ctx)];

  const patch = {
    ...('basePriceAmount' in overrides
      ? overrides.basePriceAmount === undefined
        ? {}
        : { basePriceAmount: overrides.basePriceAmount }
      : { basePriceAmount: '250000' }),
    ...(assetIds.length === 0 ? {} : { mediaAssetIds: assetIds }),
  };

  if (Object.keys(patch).length === 0) {
    return { productId: created.productId, updatedAt: created.updatedAt, assetIds };
  }

  const updated = await drafts.update({
    productId: created.productId,
    expectedUpdatedAt: new Date(created.updatedAt),
    ...patch,
  });
  return { productId: updated.productId, updatedAt: updated.updatedAt, assetIds };
}

/**
 * Runs `work` inside a request context with an Admin actor bound.
 *
 * The publication recorder attributes every transition to the acting Admin and
 * correlates it by request id, with no out-of-request fallback — inventing one
 * would produce audit rows that look correlated but are not. Service-level
 * tests therefore have to supply a real context, exactly as the HTTP middleware
 * does.
 */
export async function asAdmin<T>(
  ctx: ApiIntegrationTestContext,
  adminId: string,
  work: () => Promise<T>,
): Promise<T> {
  const requestContext = ctx.app.get(RequestContextService);
  return requestContext.run({ requestId: `test-${newId()}` }, async () => {
    requestContext.bindActor({ kind: 'ADMIN', adminId });
    return work();
  });
}

/**
 * Seeds one Admin account and returns its id, for audit attribution.
 *
 * No credential is created or needed: these suites call the service directly
 * and only require an `admin_accounts.id` for the audit row's real foreign key.
 */
export async function seedAdminId(ctx: ApiIntegrationTestContext): Promise<string> {
  const id = newId();
  await ctx.database.client.db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${id}, ${FIXTURE_ADMIN_EMAIL}, 'Quản trị viên', 'ACTIVE')
  `);
  return id;
}

/** Raw row snapshot, for before/after assertions the API cannot express. */
export async function rows<T extends Record<string, unknown>>(
  ctx: ApiIntegrationTestContext,
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  return (await ctx.database.client.db.execute(query)).rows as T[];
}

/**
 * An `IN (…)` list of parameterised ids.
 *
 * Drizzle interpolates a JavaScript array into a raw `sql` template as a
 * *tuple*, which PostgreSQL rejects for `= any(...)`. Each id is bound
 * individually instead, so the values stay parameterised.
 */
export function idList(ids: readonly string[]): ReturnType<typeof sql> {
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}
