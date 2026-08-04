/**
 * APP3-DB01 — placement stable identity, retirement and referenced-row
 * protection against a real, fully migrated database.
 *
 * The static schema can express the single-row rules; only PostgreSQL can prove
 * the cross-row ones, and those are the whole point of this contribution group.
 * A `code` that is unique per Product, a replacement that must live under the
 * same parent, and an identity that freezes the moment something references it
 * are all facts about *other rows* — a CHECK may not read them, so they live in
 * triggers and are asserted here by behaviour, never by reading the DDL back.
 *
 * Every failure is asserted by SQLSTATE, never by message text.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
/** The S24-style guard triggers raise this class, as 0030's do. */
const INTEGRITY_CONSTRAINT_VIOLATION = '23000';
const NOT_NULL_VIOLATION = '23502';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

describe('APP3 placement authority (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app3db01-placement');
  }, 180_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  async function insertCategory(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${id}, 'Test', ${`cat-${id}`}, 1, 'PUBLISHED', true)
    `);
    return id;
  }

  async function insertProduct(): Promise<string> {
    const id = newId();
    const categoryId = await insertCategory();
    await db().execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${id}, ${categoryId}, 'Test product', ${`p-${id}`}, 100000, 'VND',
              'PUBLISHED', false, 1, true)
    `);
    return id;
  }

  async function insertAsset(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/${id}/original.png`},
              'image/png', 1024, ${CHECKSUM}, 'ACCEPTED')
    `);
    return id;
  }

  interface SideInput {
    readonly productId: string;
    readonly code: string;
    readonly name?: string;
    readonly assetId?: string;
  }

  async function insertSide(input: SideInput): Promise<string> {
    const id = newId();
    const assetId = input.assetId ?? (await insertAsset());
    await db().execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id,
                                 image_width_px, image_height_px,
                                 physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${id}, ${input.productId}, ${input.code}, ${input.name ?? 'Front'}, ${assetId},
              1000, 1000, 200, 200, 5, 1)
    `);
    return id;
  }

  async function insertArea(sideId: string, code: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into embroidery_areas (id, product_side_id, code, name,
                                    bound_x_px, bound_y_px, bound_width_px, bound_height_px,
                                    max_width_mm, max_height_mm, display_order)
      values (${id}, ${sideId}, ${code}, 'Chest', 10, 10, 100, 100, 50, 50, 1)
    `);
    return id;
  }

  /** A Template header scoped to a placement — the first protection source. */
  async function insertTemplate(sideId: string, areaId: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into design_templates (id, name, slug, product_side_id, embroidery_area_id,
                                    status, current_version)
      values (${id}, 'T', ${`t-${id}`}, ${sideId}, ${areaId}, 'DRAFT', 1)
    `);
    return id;
  }

  /** A Design Session on a placement — protecting only while non-terminal. */
  async function insertSession(
    productId: string,
    sideId: string,
    areaId: string,
    status: string,
  ): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                   embroidery_area_id, design_document, document_schema_version,
                                   autosave_revision, status, expires_at, last_activity_at)
      values (${id}, ${`hash-${id}`}, ${productId}, ${sideId}, ${areaId}, '{}'::jsonb, 1,
              0, ${status}, now() + interval '30 days', now())
    `);
    return id;
  }

  describe('schema baseline', () => {
    it('applied all 34 migrations onto the 78-table schema', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const tables = await db().execute(sql`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect((applied.rows[0] as { n: number }).n).toBe(34);
      expect((tables.rows[0] as { n: number }).n).toBe(78);
    });

    it('carries the placement guard triggers', async () => {
      const { rows } = await db().execute(sql`
        select tgname from pg_trigger
         where tgrelid in ('product_sides'::regclass, 'embroidery_areas'::regclass)
           and not tgisinternal
         order by tgname
      `);
      expect(rows.map((row) => (row as { tgname: string }).tgname)).toEqual([
        'tg_embroidery_areas__protected_guard',
        'tg_embroidery_areas__replacement_guard',
        'tg_product_sides__protected_guard',
        'tg_product_sides__replacement_guard',
      ]);
    });
  });

  describe('stable code', () => {
    it('rejects a duplicate code inside one Product, and allows it across Products', async () => {
      const productA = await insertProduct();
      await insertSide({ productId: productA, code: 'front' });
      expect(await errorCode(() => insertSide({ productId: productA, code: 'front' }))).toBe(
        UNIQUE_VIOLATION,
      );

      const productB = await insertProduct();
      await expect(insertSide({ productId: productB, code: 'front' })).resolves.toBeDefined();
    });

    it('rejects a duplicate area code inside one Side, and allows it across Sides', async () => {
      const productId = await insertProduct();
      const sideA = await insertSide({ productId, code: 'a' });
      await insertArea(sideA, 'chest');
      expect(await errorCode(() => insertArea(sideA, 'chest'))).toBe(UNIQUE_VIOLATION);

      const sideB = await insertSide({ productId, code: 'b' });
      await expect(insertArea(sideB, 'chest')).resolves.toBeDefined();
    });

    it('rejects a malformed code', async () => {
      const productId = await insertProduct();
      for (const code of ['Front', '-front', 'front side', 'front!', '', 'a'.repeat(65)]) {
        expect(await errorCode(() => insertSide({ productId, code }))).toBe(CHECK_VIOLATION);
      }
    });

    it('rejects a null code', async () => {
      const productId = await insertProduct();
      const assetId = await insertAsset();
      const code = await errorCode(() =>
        db().execute(sql`
          insert into product_sides (id, product_id, name, background_asset_id,
                                     image_width_px, image_height_px,
                                     physical_width_mm, physical_height_mm, px_per_mm, display_order)
          values (${newId()}, ${productId}, 'Front', ${assetId}, 1000, 1000, 200, 200, 5, 1)
        `),
      );
      expect(code).toBe(NOT_NULL_VIOLATION);
    });
  });

  describe('retirement and replacement', () => {
    it('accepts retirement with a same-parent replacement', async () => {
      const productId = await insertProduct();
      const oldSide = await insertSide({ productId, code: 'front-v1' });
      const newSide = await insertSide({ productId, code: 'front-v2' });
      await db().execute(sql`
        update product_sides set retired_at = now(), superseded_by_id = ${newSide}
         where id = ${oldSide}
      `);
      const { rows } = await db().execute(
        sql`select superseded_by_id from product_sides where id = ${oldSide}`,
      );
      expect((rows[0] as { superseded_by_id: string }).superseded_by_id).toBe(newSide);
    });

    it('rejects a replacement pointer without retirement', async () => {
      const productId = await insertProduct();
      const oldSide = await insertSide({ productId, code: 'x1' });
      const newSide = await insertSide({ productId, code: 'x2' });
      const code = await errorCode(() =>
        db().execute(
          sql`update product_sides set superseded_by_id = ${newSide} where id = ${oldSide}`,
        ),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects self replacement', async () => {
      const productId = await insertProduct();
      const side = await insertSide({ productId, code: 'self' });
      const code = await errorCode(() =>
        db().execute(sql`
          update product_sides set retired_at = now(), superseded_by_id = ${side} where id = ${side}
        `),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a cross-parent replacement', async () => {
      const productA = await insertProduct();
      const productB = await insertProduct();
      const sideA = await insertSide({ productId: productA, code: 'a' });
      const sideB = await insertSide({ productId: productB, code: 'b' });
      const code = await errorCode(() =>
        db().execute(sql`
          update product_sides set retired_at = now(), superseded_by_id = ${sideB} where id = ${sideA}
        `),
      );
      expect(code).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
    });

    it('rejects a direct two-row replacement cycle', async () => {
      const productId = await insertProduct();
      const first = await insertSide({ productId, code: 'c1' });
      const second = await insertSide({ productId, code: 'c2' });
      await db().execute(sql`
        update product_sides set retired_at = now(), superseded_by_id = ${second} where id = ${first}
      `);
      const code = await errorCode(() =>
        db().execute(sql`
          update product_sides set retired_at = now(), superseded_by_id = ${first} where id = ${second}
        `),
      );
      expect(code).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
    });

    it('applies the same rules to embroidery areas', async () => {
      const productId = await insertProduct();
      const sideA = await insertSide({ productId, code: 'sa' });
      const sideB = await insertSide({ productId, code: 'sb' });
      const areaOld = await insertArea(sideA, 'a1');
      const areaNew = await insertArea(sideA, 'a2');
      const areaOther = await insertArea(sideB, 'a3');

      await db().execute(sql`
        update embroidery_areas set retired_at = now(), superseded_by_id = ${areaNew}
         where id = ${areaOld}
      `);
      expect(
        await errorCode(() =>
          db().execute(sql`
            update embroidery_areas set retired_at = now(), superseded_by_id = ${areaOther}
             where id = ${areaNew}
          `),
        ),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      // Same side, so the cross-parent guard is satisfied and the missing
      // retirement is the only rule broken — otherwise the trigger would fire
      // first and this case would silently stop testing the CHECK.
      const areaSpare = await insertArea(sideA, 'a4');
      expect(
        await errorCode(() =>
          db().execute(sql`
            update embroidery_areas set superseded_by_id = ${areaSpare} where id = ${areaNew}
          `),
        ),
      ).toBe(CHECK_VIOLATION);
      expect(areaOther).toBeDefined();
    });
  });

  describe('referenced-row protection', () => {
    async function protectedByTemplate(): Promise<{ sideId: string; areaId: string }> {
      const productId = await insertProduct();
      const sideId = await insertSide({ productId, code: 'guarded' });
      const areaId = await insertArea(sideId, 'guarded-area');
      await insertTemplate(sideId, areaId);
      return { sideId, areaId };
    }

    it('lets an unreferenced side change its geometry and identity', async () => {
      const productId = await insertProduct();
      const sideId = await insertSide({ productId, code: 'free' });
      await db().execute(
        sql`update product_sides set px_per_mm = 6, code = 'free-renamed' where id = ${sideId}`,
      );
      const { rows } = await db().execute(
        sql`select code, px_per_mm from product_sides where id = ${sideId}`,
      );
      expect((rows[0] as { code: string }).code).toBe('free-renamed');
    });

    it('freezes identity and geometry once a Template header scopes to it', async () => {
      const { sideId } = await protectedByTemplate();
      for (const statement of [
        sql`update product_sides set px_per_mm = 9 where id = ${sideId}`,
        sql`update product_sides set code = 'moved' where id = ${sideId}`,
        sql`update product_sides set image_width_px = 2000 where id = ${sideId}`,
        sql`update product_sides set physical_width_mm = 999 where id = ${sideId}`,
      ]) {
        expect(await errorCode(() => db().execute(statement))).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      }
    });

    it('rejects re-parenting a protected side', async () => {
      const { sideId } = await protectedByTemplate();
      const other = await insertProduct();
      expect(
        await errorCode(() =>
          db().execute(sql`update product_sides set product_id = ${other} where id = ${sideId}`),
        ),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
    });

    it('rejects swapping the background asset of a protected side', async () => {
      const { sideId } = await protectedByTemplate();
      const replacement = await insertAsset();
      expect(
        await errorCode(() =>
          db().execute(
            sql`update product_sides set background_asset_id = ${replacement} where id = ${sideId}`,
          ),
        ),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
    });

    it('still allows display copy, ordering and retirement on a protected side', async () => {
      const productId = await insertProduct();
      const sideId = await insertSide({ productId, code: 'shown' });
      const areaId = await insertArea(sideId, 'shown-area');
      await insertTemplate(sideId, areaId);
      const successor = await insertSide({ productId, code: 'shown-v2' });

      await db().execute(sql`
        update product_sides set name = 'Mặt trước', display_order = 7 where id = ${sideId}
      `);
      await db().execute(sql`
        update product_sides set retired_at = now(), superseded_by_id = ${successor}
         where id = ${sideId}
      `);
      const { rows } = await db().execute(
        sql`select name, display_order, retired_at from product_sides where id = ${sideId}`,
      );
      expect((rows[0] as { name: string }).name).toBe('Mặt trước');
      expect((rows[0] as { retired_at: Date | null }).retired_at).not.toBeNull();
    });

    it('locks on a non-terminal Session and not on a terminal one', async () => {
      for (const status of ['ACTIVE', 'SUBMITTED']) {
        const productId = await insertProduct();
        const sideId = await insertSide({ productId, code: `live-${status.toLowerCase()}` });
        const areaId = await insertArea(sideId, 'area');
        await insertSession(productId, sideId, areaId, status);
        expect(
          await errorCode(() =>
            db().execute(sql`update product_sides set px_per_mm = 8 where id = ${sideId}`),
          ),
        ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      }

      for (const status of ['EXPIRED', 'DELETED']) {
        const productId = await insertProduct();
        const sideId = await insertSide({ productId, code: `done-${status.toLowerCase()}` });
        const areaId = await insertArea(sideId, 'area');
        await insertSession(productId, sideId, areaId, status);
        await db().execute(sql`update product_sides set px_per_mm = 8 where id = ${sideId}`);
        await db().execute(sql`update embroidery_areas set bound_x_px = 11 where id = ${areaId}`);
      }
    });

    it('freezes an embroidery area referenced by a Template header', async () => {
      const { areaId } = await protectedByTemplate();
      for (const statement of [
        sql`update embroidery_areas set bound_width_px = 500 where id = ${areaId}`,
        sql`update embroidery_areas set code = 'shifted' where id = ${areaId}`,
        sql`update embroidery_areas set max_width_mm = 300 where id = ${areaId}`,
      ]) {
        expect(await errorCode(() => db().execute(statement))).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      }
      await db().execute(
        sql`update embroidery_areas set name = 'Ngực trái', display_order = 3 where id = ${areaId}`,
      );
    });

    /**
     * The third protection source, seeded through its real chain.
     *
     * An approval snapshot is the frozen record of what a customer approved, so
     * it protects a placement even when no Template and no live Session point at
     * it. Reaching it means seeding customer → request → case → version → grant
     * → challenge; that cost is the reason it is one case rather than several,
     * and it is worth paying because the alternative is asserting the predicate
     * against nothing.
     */
    it('locks on an approval snapshot', async () => {
      const productId = await insertProduct();
      const sideId = await insertSide({ productId, code: 'approved' });
      const areaId = await insertArea(sideId, 'approved-area');

      const customerId = newId();
      const requestId = newId();
      const caseId = newId();
      const versionId = newId();
      const grantId = newId();
      const challengeId = newId();
      const variantId = newId();

      await db().execute(
        sql`insert into customers (id, verified_at) values (${customerId}, now())`,
      );
      await db().execute(sql`
        insert into custom_requests (id, code, customer_id, status)
        values (${requestId}, ${`REQ-${requestId.slice(0, 8)}`}, ${customerId}, 'APPROVED')
      `);
      await db().execute(
        sql`insert into design_cases (id, custom_request_id) values (${caseId}, ${requestId})`,
      );
      await db().execute(sql`
        insert into product_variants (id, product_id, display_order, is_active)
        values (${variantId}, ${productId}, 1, true)
      `);
      await db().execute(sql`
        insert into design_versions (id, design_case_id, version, status, design_document,
                                     document_schema_version, document_hash, product_id,
                                     product_variant_id, product_side_id, embroidery_area_id,
                                     physical_width_mm, physical_height_mm)
        values (${versionId}, ${caseId}, 1, 'APPROVED', '{}'::jsonb, 1,
                ${`sha256:${'c'.repeat(64)}`}, ${productId}, ${variantId},
                ${sideId}, ${areaId}, 100, 100)
      `);
      await db().execute(sql`
        insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                          scope_kind, status, expires_at)
        values (${grantId}, ${customerId}, ${requestId}, ${`tok-${grantId}`},
                'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 day')
      `);
      await db().execute(sql`
        insert into contact_verification_challenges (id, contact_kind, normalized_value, purpose,
                                                     code_hash, status, expires_at)
        values (${challengeId}, 'EMAIL', ${`a${challengeId}@example.test`}, 'STEP_UP',
                ${`h-${challengeId}`}, 'VERIFIED', now() + interval '1 day')
      `);
      await db().execute(sql`
        insert into approval_snapshots (id, design_version_id, design_case_id, custom_request_id,
                                        customer_id, document_hash, product_id, product_variant_id,
                                        product_side_id, embroidery_area_id, product_name,
                                        side_name, area_name, physical_width_mm, physical_height_mm,
                                        quantity_total, grant_id, step_up_challenge_id, approved_at)
        values (${newId()}, ${versionId}, ${caseId}, ${requestId}, ${customerId},
                ${`sha256:${'b'.repeat(64)}`}, ${productId}, ${variantId}, ${sideId}, ${areaId},
                'Test product', 'Front', 'Chest', 100, 100, 1, ${grantId}, ${challengeId}, now())
      `);

      expect(
        await errorCode(() =>
          db().execute(sql`update product_sides set px_per_mm = 12 where id = ${sideId}`),
        ),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      expect(
        await errorCode(() =>
          db().execute(sql`update embroidery_areas set bound_width_px = 12 where id = ${areaId}`),
        ),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      expect(
        await errorCode(() => db().execute(sql`delete from product_sides where id = ${sideId}`)),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      // Display copy still moves, exactly as under the other two sources.
      await db().execute(sql`update product_sides set name = 'Trước' where id = ${sideId}`);
    });

    it('rejects deleting a protected row and allows deleting an unprotected one', async () => {
      const { sideId, areaId } = await protectedByTemplate();
      expect(
        await errorCode(() => db().execute(sql`delete from embroidery_areas where id = ${areaId}`)),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      expect(
        await errorCode(() => db().execute(sql`delete from product_sides where id = ${sideId}`)),
      ).toBe(INTEGRITY_CONSTRAINT_VIOLATION);

      const productId = await insertProduct();
      const freeSide = await insertSide({ productId, code: 'free-delete' });
      const freeArea = await insertArea(freeSide, 'free-area');
      await db().execute(sql`delete from embroidery_areas where id = ${freeArea}`);
      await db().execute(sql`delete from product_sides where id = ${freeSide}`);
      const { rows } = await db().execute(
        sql`select count(*)::int as n from product_sides where id = ${freeSide}`,
      );
      expect((rows[0] as { n: number }).n).toBe(0);
    });
  });
});
