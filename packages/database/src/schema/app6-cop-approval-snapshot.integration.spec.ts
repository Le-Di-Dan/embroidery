/**
 * APP6-DB01 — the customer-owned-product branch of TBL-031
 * `approval_snapshots`, against a real fully migrated database.
 *
 * Split from `app6-cop-design-context.integration.spec.ts` by responsibility,
 * not by size: that suite owns the physical delta and the `design_versions`
 * branch, this one owns the **approval evidence** — the row APP7 converts into
 * an order, and the one row in the chain that may never be edited afterwards.
 *
 * Two things are proved here that the version suite cannot. First, CST-131's
 * truth table on a table with **no placement labels of its own**: a COP
 * snapshot's human placement context arrives in the existing frozen
 * `side_name`/`area_name` copies (COL-TBL031-06), and if that were not enough,
 * the migration would have had to add columns it deliberately did not add.
 * Second, that `customer_owned_product_id` inherits CST-091's row-wide freeze
 * without a trigger change — a new column on an immutable table is only
 * immutable if the existing guard is column-blind, and this asserts that it is.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

/** PostgreSQL's `check_violation`. Asserted by code, never by message text. */
const CHECK_VIOLATION = '23514';
/** The `RAISE ... USING ERRCODE = '23000'` the S24 mutation guards raise. */
const INTEGRITY_VIOLATION = '23000';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

/** A complete Catalog placement quartet — the only shape valid before APP6. */
interface CatalogPlacement {
  readonly productId: string;
  readonly productVariantId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

interface Branch {
  readonly productId?: string | null;
  readonly productVariantId?: string | null;
  readonly productSideId?: string | null;
  readonly embroideryAreaId?: string | null;
  readonly customerOwnedProductId?: string | null;
}

describe('APP6 COP approval snapshot (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app6db01-cop-approval-snapshot');
  }, 240_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /**
   * Runs `work` and returns the SQLSTATE it raised.
   *
   * Through `driverErrorCode`, never `error.code`: drizzle wraps the `pg` error
   * and attaches the original as `cause`, so a direct read finds nothing.
   */
  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  /** A real, complete Catalog placement — seeded, never faked. */
  async function insertCatalogPlacement(): Promise<CatalogPlacement> {
    const categoryId = newId();
    await db().execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Test', ${`cat-${categoryId}`}, 1, 'PUBLISHED', true)
    `);
    const productId = newId();
    await db().execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Test product', ${`p-${productId}`}, 100000, 'VND',
              'PUBLISHED', false, 1, true)
    `);
    const productVariantId = newId();
    await db().execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${productVariantId}, ${productId}, 'Navy', 'L', 1, true)
    `);
    const backgroundAssetId = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${backgroundAssetId}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`test/${backgroundAssetId}/original.png`}, 'image/png', 1024, ${CHECKSUM}, 'ACCEPTED')
    `);
    const productSideId = newId();
    await db().execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id,
                                 image_width_px, image_height_px,
                                 physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${productSideId}, ${productId}, ${`s-${productSideId.slice(0, 8)}`}, 'Front',
              ${backgroundAssetId}, 1000, 1000, 200, 200, 5, 1)
    `);
    const embroideryAreaId = newId();
    await db().execute(sql`
      insert into embroidery_areas (id, product_side_id, code, name,
                                    bound_x_px, bound_y_px, bound_width_px, bound_height_px,
                                    max_width_mm, max_height_mm, display_order)
      values (${embroideryAreaId}, ${productSideId}, ${`a-${embroideryAreaId.slice(0, 8)}`}, 'Chest',
              10, 10, 100, 100, 50, 50, 1)
    `);
    return { productId, productVariantId, productSideId, embroideryAreaId };
  }

  interface SnapshotContext {
    readonly customerId: string;
    readonly customRequestId: string;
    readonly designCaseId: string;
    readonly designVersionId: string;
    readonly customerOwnedProductId: string;
    readonly grantId: string;
    readonly stepUpChallengeId: string;
    readonly placement: CatalogPlacement;
  }

  /**
   * One approved COP design version with every anchor an approval snapshot
   * needs, plus a spare Catalog placement so the Catalog branch and the invalid
   * mixtures can be built from real rows rather than invented identifiers.
   */
  async function context(): Promise<SnapshotContext> {
    const customerId = newId();
    await db().execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Test customer', now())
    `);

    const customRequestId = newId();
    await db().execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'APPROVED')
    `);

    const designCaseId = newId();
    await db().execute(sql`
      insert into design_cases (id, custom_request_id) values (${designCaseId}, ${customRequestId})
    `);

    // CST-027 — at most one COP per request, so each context brings its own.
    const customerOwnedProductId = newId();
    await db().execute(sql`
      insert into customer_owned_products (id, custom_request_id, name, description)
      values (${customerOwnedProductId}, ${customRequestId}, 'Customer jacket',
              'Navy wool, supplied by the customer')
    `);

    const designVersionId = newId();
    await db().execute(sql`
      insert into design_versions (id, design_case_id, version, status, design_document,
                                   document_schema_version, document_hash,
                                   customer_owned_product_id,
                                   placement_side_label, placement_area_label,
                                   physical_width_mm, physical_height_mm, approved_at)
      values (${designVersionId}, ${designCaseId}, 1, 'APPROVED', '{}'::jsonb, 1, ${CHECKSUM},
              ${customerOwnedProductId}, 'Left chest', 'Left chest badge', 80, 60, now())
    `);

    const grantId = newId();
    await db().execute(sql`
      insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                        scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${customRequestId}, ${`hash-${grantId}`},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '7 days')
    `);

    const stepUpChallengeId = newId();
    await db().execute(sql`
      insert into contact_verification_challenges
             (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${stepUpChallengeId}, 'EMAIL', ${`c-${stepUpChallengeId}@example.test`}, 'STEP_UP',
              ${`hash-${stepUpChallengeId}`}, 'VERIFIED', now() + interval '30 minutes', now())
    `);

    return {
      customerId,
      customRequestId,
      designCaseId,
      designVersionId,
      customerOwnedProductId,
      grantId,
      stepUpChallengeId,
      placement: await insertCatalogPlacement(),
    };
  }

  interface SnapshotInput extends Branch {
    readonly variantLabel?: string | null;
  }

  async function insertSnapshot(ctx: SnapshotContext, input: SnapshotInput): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into approval_snapshots (id, design_version_id, design_case_id, custom_request_id,
                                      customer_id, document_hash,
                                      product_id, product_variant_id, product_side_id,
                                      embroidery_area_id, customer_owned_product_id,
                                      product_name, variant_label, side_name, area_name,
                                      physical_width_mm, physical_height_mm, quantity_total,
                                      grant_id, step_up_challenge_id, approved_at)
      values (${id}, ${ctx.designVersionId}, ${ctx.designCaseId}, ${ctx.customRequestId},
              ${ctx.customerId}, ${CHECKSUM},
              ${input.productId ?? null}, ${input.productVariantId ?? null},
              ${input.productSideId ?? null}, ${input.embroideryAreaId ?? null},
              ${input.customerOwnedProductId ?? null},
              'Customer jacket', ${input.variantLabel ?? null}, 'Left chest', 'Left chest badge',
              80, 60, 12, ${ctx.grantId}, ${ctx.stepUpChallengeId}, now())
    `);
    return id;
  }

  describe('branch truth table (CST-131)', () => {
    it('accepts the complete Catalog branch, exactly as before APP6', async () => {
      const ctx = await context();
      const id = await insertSnapshot(ctx, { ...ctx.placement, variantLabel: 'Navy / L' });
      const { rows } = await db().execute(
        sql`select customer_owned_product_id from approval_snapshots where id = ${id}`,
      );
      expect(rows[0]).toEqual({ customer_owned_product_id: null });
    });

    it('accepts the complete COP branch with no Catalog identity at all', async () => {
      const ctx = await context();
      const id = await insertSnapshot(ctx, {
        customerOwnedProductId: ctx.customerOwnedProductId,
      });
      const { rows } = await db().execute(sql`
        select product_id, product_variant_id, product_side_id, embroidery_area_id,
               customer_owned_product_id, product_name, variant_label, side_name, area_name
          from approval_snapshots where id = ${id}
      `);
      // `product_name`/`side_name`/`area_name` are frozen human evidence, not
      // identity — `product_name` from `customer_owned_products.name` and the
      // other two from the version's labels. `variant_label` stays NULL: a COP
      // has no variant, and that column was already nullable.
      expect(rows[0]).toEqual({
        product_id: null,
        product_variant_id: null,
        product_side_id: null,
        embroidery_area_id: null,
        customer_owned_product_id: ctx.customerOwnedProductId,
        product_name: 'Customer jacket',
        variant_label: null,
        side_name: 'Left chest',
        area_name: 'Left chest badge',
      });
    });

    it('rejects a mixed Catalog + COP snapshot', async () => {
      const ctx = await context();
      const code = await errorCode(() =>
        insertSnapshot(ctx, {
          ...ctx.placement,
          customerOwnedProductId: ctx.customerOwnedProductId,
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['product_id', 'productId'],
      ['product_variant_id', 'productVariantId'],
      ['product_side_id', 'productSideId'],
      ['embroidery_area_id', 'embroideryAreaId'],
    ])('rejects a partial Catalog quartet missing %s', async (_column, key) => {
      const ctx = await context();
      const placement: Record<string, string | null> = { ...ctx.placement };
      placement[key] = null;
      const code = await errorCode(() => insertSnapshot(ctx, placement));
      // A half-populated placement is not a stricter record than a fabricated
      // one; it is an unanswerable one, and both are rejected here.
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a snapshot with neither branch', async () => {
      const ctx = await context();
      const code = await errorCode(() => insertSnapshot(ctx, {}));
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('CST-091 — the snapshot stays immutable with its new column', () => {
    async function snapshot(): Promise<string> {
      const ctx = await context();
      return insertSnapshot(ctx, { customerOwnedProductId: ctx.customerOwnedProductId });
    }

    it('rejects an UPDATE of customer_owned_product_id', async () => {
      const id = await snapshot();
      // The `0030` guard is row-wide `'always'` with an empty exception list,
      // so it is column-blind: the new column is frozen the day it exists and
      // needed no trigger change.
      const code = await errorCode(() =>
        db().execute(
          sql`update approval_snapshots set customer_owned_product_id = null where id = ${id}`,
        ),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });

    it('rejects a DELETE of the snapshot row', async () => {
      const id = await snapshot();
      const code = await errorCode(() =>
        db().execute(sql`delete from approval_snapshots where id = ${id}`),
      );
      expect(code).toBe(INTEGRITY_VIOLATION);
    });
  });
});
