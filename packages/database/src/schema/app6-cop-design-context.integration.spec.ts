/**
 * APP6-DB01 — the customer-owned-product design context, against a real fully
 * migrated database.
 *
 * `APP6-R00` found the contradiction this migration closes: `design_versions`
 * and `approval_snapshots` both declared the Catalog placement quartet
 * `NOT NULL`, while a customer-owned product (TBL-038) holds none of it and is
 * **never a SKU** (INV-13) — yet a formal design version is mandatory on a COP
 * request's approval path (`TR-LC11-09` is guarded by `TR-LC08-04`).
 *
 * What this suite proves is not that the columns exist — the drizzle schema
 * already says that — but that PostgreSQL now accepts exactly the two branches
 * ADR-APP6-001 authorises and refuses every row shape in between. The
 * load-bearing cases are the **partial** quartet and the labelled Catalog row:
 * an "at least one identifier present" reading of the contract would let both
 * through, and a half-populated placement is exactly the failure the ADR exists
 * to prevent, alongside the fabricated one.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

/** PostgreSQL's `check_violation`. Asserted by code, never by message text. */
const CHECK_VIOLATION = '23514';
/** `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';
/** The `RAISE ... USING ERRCODE = '23000'` the S24 mutation guards raise. */
const INTEGRITY_VIOLATION = '23000';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

const FULL_MIGRATION_COUNT = 36;
const TABLE_COUNT = 78;

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
  readonly placementSideLabel?: string | null;
  readonly placementAreaLabel?: string | null;
}

describe('APP6 customer-owned-product design context (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app6db01-cop-design-context');
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

  async function insertCustomer(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${id}, 'Test customer', now())
    `);
    return id;
  }

  async function insertCatalogAsset(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/${id}/original.png`},
              'image/png', 1024, ${CHECKSUM}, 'ACCEPTED')
    `);
    return id;
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
    const productSideId = newId();
    await db().execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id,
                                 image_width_px, image_height_px,
                                 physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${productSideId}, ${productId}, ${`s-${productSideId.slice(0, 8)}`}, 'Front',
              ${await insertCatalogAsset()}, 1000, 1000, 200, 200, 5, 1)
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

  async function insertRequest(customerId: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${id}, ${`REQ-${id}`}, ${customerId}, 'DESIGN_REVIEW')
    `);
    return id;
  }

  async function insertDesignCase(customRequestId: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into design_cases (id, custom_request_id) values (${id}, ${customRequestId})
    `);
    return id;
  }

  /** CST-027 allows at most one COP per request, so each caller brings its own. */
  async function insertCustomerOwnedProduct(customRequestId: string): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into customer_owned_products (id, custom_request_id, name, description)
      values (${id}, ${customRequestId}, 'Customer jacket', 'Navy wool, supplied by the customer')
    `);
    return id;
  }

  interface VersionInput extends Branch {
    readonly designCaseId: string;
    readonly version?: number;
    readonly status?: string;
    readonly widthMm?: number;
    readonly heightMm?: number;
  }

  async function insertDesignVersion(input: VersionInput): Promise<string> {
    const id = newId();
    const status = input.status ?? 'DRAFT';
    await db().execute(sql`
      insert into design_versions (id, design_case_id, version, status, design_document,
                                   document_schema_version, document_hash,
                                   product_id, product_variant_id, product_side_id,
                                   embroidery_area_id, customer_owned_product_id,
                                   placement_side_label, placement_area_label,
                                   physical_width_mm, physical_height_mm)
      values (${id}, ${input.designCaseId}, ${input.version ?? 1}, ${status}, '{}'::jsonb, 1,
              ${status === 'DRAFT' ? null : CHECKSUM},
              ${input.productId ?? null}, ${input.productVariantId ?? null},
              ${input.productSideId ?? null}, ${input.embroideryAreaId ?? null},
              ${input.customerOwnedProductId ?? null},
              ${input.placementSideLabel ?? null}, ${input.placementAreaLabel ?? null},
              ${input.widthMm ?? 80}, ${input.heightMm ?? 60})
    `);
    return id;
  }

  interface Scaffold {
    readonly customerId: string;
    readonly customRequestId: string;
    readonly designCaseId: string;
  }

  /** One request with a design case behind it — the version's whole context. */
  async function scaffold(): Promise<Scaffold> {
    const customerId = await insertCustomer();
    const customRequestId = await insertRequest(customerId);
    return {
      customerId,
      customRequestId,
      designCaseId: await insertDesignCase(customRequestId),
    };
  }

  describe('schema baseline', () => {
    it('applied all 36 migrations onto the 78-table schema', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const tables = await db().execute(sql`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect((applied.rows[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);
      expect((tables.rows[0] as { n: number }).n).toBe(TABLE_COUNT);
    });

    it.each(['design_versions', 'approval_snapshots'])(
      'made every Catalog placement column on %s nullable',
      async (table) => {
        const { rows } = await db().execute(sql`
          select column_name, is_nullable
            from information_schema.columns
           where table_schema = 'public' and table_name = ${table}
             and column_name in ('product_id', 'product_variant_id',
                                 'product_side_id', 'embroidery_area_id')
           order by column_name
        `);
        expect(rows).toHaveLength(4);
        for (const row of rows as unknown as { is_nullable: string }[]) {
          expect(row.is_nullable).toBe('YES');
        }
      },
    );

    it('carries the three new design_versions columns, nullable and canonically typed', async () => {
      const { rows } = await db().execute(sql`
        select column_name, data_type, is_nullable
          from information_schema.columns
         where table_schema = 'public' and table_name = 'design_versions'
           and column_name in ('customer_owned_product_id',
                               'placement_side_label', 'placement_area_label')
         order by column_name
      `);
      expect(rows).toEqual([
        { column_name: 'customer_owned_product_id', data_type: 'uuid', is_nullable: 'YES' },
        { column_name: 'placement_area_label', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'placement_side_label', data_type: 'text', is_nullable: 'YES' },
      ]);
    });

    it('carries approval_snapshots.customer_owned_product_id and no label pair', async () => {
      const { rows } = await db().execute(sql`
        select column_name, data_type, is_nullable
          from information_schema.columns
         where table_schema = 'public' and table_name = 'approval_snapshots'
           and column_name in ('customer_owned_product_id',
                               'placement_side_label', 'placement_area_label')
         order by column_name
      `);
      // The labels are deliberately absent here: `side_name`/`area_name` are
      // already this table's frozen human evidence (COL-TBL031-06).
      expect(rows).toEqual([
        { column_name: 'customer_owned_product_id', data_type: 'uuid', is_nullable: 'YES' },
      ]);
    });

    it.each([
      ['fk_design_versions__customer_owned_product_id', 'design_versions'],
      ['fk_approval_snapshots__customer_owned_product_id', 'approval_snapshots'],
    ])('declares %s as an ON DELETE RESTRICT edge onto the COP table', async (name, source) => {
      const { rows } = await db().execute(sql`
        select c.confdeltype, s.relname as source, t.relname as target
          from pg_constraint c
          join pg_class s on s.oid = c.conrelid
          join pg_class t on t.oid = c.confrelid
         where c.conname = ${name} and c.contype = 'f'
      `);
      // 'r' is RESTRICT. `cascade` would delete approval evidence along with the
      // item it describes; `set null` would leave a row with neither branch.
      expect(rows).toEqual([{ confdeltype: 'r', source, target: 'customer_owned_products' }]);
    });

    it('carries CST-129, CST-130 and CST-131 by name', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where contype = 'c'
           and conrelid in ('design_versions'::regclass, 'approval_snapshots'::regclass)
           and conname in ('ck_design_versions__exactly_one_placement_branch',
                           'ck_design_versions__cop_placement_labels',
                           'ck_approval_snapshots__exactly_one_placement_branch')
         order by conname
      `);
      expect(rows.map((r) => (r as { conname: string }).conname)).toEqual([
        'ck_approval_snapshots__exactly_one_placement_branch',
        'ck_design_versions__cop_placement_labels',
        'ck_design_versions__exactly_one_placement_branch',
      ]);
    });

    it('leaves the existing uniqueness and index surface of both tables untouched', async () => {
      const { rows } = await db().execute(sql`
        select i.relname, pg_get_expr(x.indpred, x.indrelid) as pred
          from pg_index x
          join pg_class i on i.oid = x.indexrelid
         where x.indrelid in ('design_versions'::regclass, 'approval_snapshots'::regclass)
         order by i.relname
      `);
      // The whole surface, asserted as a set rather than by absence of a name:
      // `ix_approval_snapshots__request` (IDX-136) comes from 0031, outside the
      // table DSL, so "what the drizzle file declares" is not the index surface.
      // No FK-support or COP-lookup index was added: ADR-APP6-001 §4.2 rules a
      // COP access path a later decision, not a correctness one.
      expect(rows).toEqual([
        { relname: 'ix_approval_snapshots__request', pred: null },
        { relname: 'pk_approval_snapshots', pred: null },
        { relname: 'pk_design_versions', pred: null },
        { relname: 'uq_approval_snapshots__version', pred: null },
        {
          relname: 'uq_design_versions__case__sent_for_review',
          pred: "(status = 'SENT_FOR_REVIEW'::text)",
        },
        { relname: 'uq_design_versions__case_version', pred: null },
      ]);
    });

    it('keeps the positive-geometry CHECKs on both tables', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where contype = 'c'
           and conname in ('ck_design_versions__physical_mm_positive',
                           'ck_approval_snapshots__physical_mm_positive')
         order by conname
      `);
      expect(rows).toHaveLength(2);
    });
  });

  describe('design_versions — branch truth table', () => {
    it('accepts the complete Catalog branch, exactly as before APP6', async () => {
      const { designCaseId } = await scaffold();
      const placement = await insertCatalogPlacement();
      const id = await insertDesignVersion({ designCaseId, ...placement });
      const { rows } = await db().execute(sql`
        select customer_owned_product_id, placement_side_label, placement_area_label
          from design_versions where id = ${id}
      `);
      expect(rows[0]).toEqual({
        customer_owned_product_id: null,
        placement_side_label: null,
        placement_area_label: null,
      });
    });

    it('accepts the complete COP branch — no Catalog identity, labels present', async () => {
      const { designCaseId, customRequestId } = await scaffold();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      const id = await insertDesignVersion({
        designCaseId,
        customerOwnedProductId,
        placementSideLabel: 'Left chest',
        placementAreaLabel: 'Left chest badge',
      });
      const { rows } = await db().execute(sql`
        select product_id, product_variant_id, product_side_id, embroidery_area_id,
               customer_owned_product_id, placement_side_label, placement_area_label,
               physical_width_mm, physical_height_mm
          from design_versions where id = ${id}
      `);
      expect(rows[0]).toEqual({
        product_id: null,
        product_variant_id: null,
        product_side_id: null,
        embroidery_area_id: null,
        customer_owned_product_id: customerOwnedProductId,
        placement_side_label: 'Left chest',
        placement_area_label: 'Left chest badge',
        // The frozen placement envelope of this version — never copied from
        // `customer_owned_products`' own item dimensions (ADR-APP6-001 §3.3).
        physical_width_mm: '80',
        physical_height_mm: '60',
      });
    });

    it('rejects a mixed Catalog + COP row', async () => {
      const { designCaseId, customRequestId } = await scaffold();
      const placement = await insertCatalogPlacement();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      const code = await errorCode(() =>
        insertDesignVersion({
          designCaseId,
          ...placement,
          customerOwnedProductId,
          placementSideLabel: 'Left chest',
          placementAreaLabel: 'Left chest badge',
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
      const { designCaseId } = await scaffold();
      const placement: Record<string, string | null> = { ...(await insertCatalogPlacement()) };
      placement[key] = null;
      const code = await errorCode(() =>
        insertDesignVersion({ designCaseId, ...(placement as Branch) }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a row with neither branch', async () => {
      const { designCaseId } = await scaffold();
      const code = await errorCode(() => insertDesignVersion({ designCaseId }));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a Catalog row that also carries placement labels', async () => {
      const { designCaseId } = await scaffold();
      const placement = await insertCatalogPlacement();
      const code = await errorCode(() =>
        insertDesignVersion({
          designCaseId,
          ...placement,
          placementSideLabel: 'Left chest',
          placementAreaLabel: 'Left chest badge',
        }),
      );
      // ADR-APP6-001 §4.1: on the Catalog branch the four FKs carry the
      // identity, so a label there is unverifiable text competing with them.
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('design_versions — COP placement labels (CST-130)', () => {
    it.each([
      ['both labels absent', null, null],
      ['the side label absent', null, 'Left chest badge'],
      ['the area label absent', 'Left chest', null],
      ['a blank side label', '   ', 'Left chest badge'],
      ['a tab-only area label', 'Left chest', '\t'],
      ['a newline-only side label', '\n', 'Left chest badge'],
    ])('rejects a COP version with %s', async (_case, side, area) => {
      const { designCaseId, customRequestId } = await scaffold();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      const code = await errorCode(() =>
        insertDesignVersion({
          designCaseId,
          customerOwnedProductId,
          placementSideLabel: side,
          placementAreaLabel: area,
        }),
      );
      // The whitespace cases are why `btrim` carries an explicit character set:
      // the bare form trims spaces only, so a tab-only label would pass a
      // "not blank" rule that exists precisely to reject it.
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('design_versions — geometry is unchanged on both branches', () => {
    it.each([
      ['zero width', 0, 60],
      ['negative height', 80, -1],
    ])('still rejects %s on the COP branch', async (_case, widthMm, heightMm) => {
      const { designCaseId, customRequestId } = await scaffold();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      const code = await errorCode(() =>
        insertDesignVersion({
          designCaseId,
          customerOwnedProductId,
          placementSideLabel: 'Left chest',
          placementAreaLabel: 'Left chest badge',
          widthMm,
          heightMm,
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('REL-107 / REL-108 — the COP edge restricts deletion', () => {
    it('refuses to delete a customer-owned product a design version points at', async () => {
      const { designCaseId, customRequestId } = await scaffold();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      await insertDesignVersion({
        designCaseId,
        customerOwnedProductId,
        placementSideLabel: 'Left chest',
        placementAreaLabel: 'Left chest badge',
      });
      const code = await errorCode(() =>
        db().execute(sql`delete from customer_owned_products where id = ${customerOwnedProductId}`),
      );
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    });

    it('refuses a customer_owned_product_id that names no row', async () => {
      const { designCaseId } = await scaffold();
      const code = await errorCode(() =>
        insertDesignVersion({
          designCaseId,
          customerOwnedProductId: newId(),
          placementSideLabel: 'Left chest',
          placementAreaLabel: 'Left chest badge',
        }),
      );
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    });
  });

  describe('CST-090 — the new columns freeze at the existing send point', () => {
    it('allows a label edit while the version is still DRAFT', async () => {
      const { designCaseId, customRequestId } = await scaffold();
      const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
      const id = await insertDesignVersion({
        designCaseId,
        customerOwnedProductId,
        placementSideLabel: 'Left chest',
        placementAreaLabel: 'Left chest badge',
      });
      await db().execute(
        sql`update design_versions set placement_side_label = 'Right chest' where id = ${id}`,
      );
      const { rows } = await db().execute(
        sql`select placement_side_label from design_versions where id = ${id}`,
      );
      expect(rows[0]).toEqual({ placement_side_label: 'Right chest' });
    });

    it.each(['placement_side_label', 'placement_area_label', 'customer_owned_product_id'])(
      'rejects an edit to %s once the version has left DRAFT',
      async (column) => {
        const { designCaseId, customRequestId } = await scaffold();
        const customerOwnedProductId = await insertCustomerOwnedProduct(customRequestId);
        const id = await insertDesignVersion({
          designCaseId,
          customerOwnedProductId,
          placementSideLabel: 'Left chest',
          placementAreaLabel: 'Left chest badge',
          status: 'SENT_FOR_REVIEW',
        });
        // The `0030` guard is an exception list, not an allow list — it diffs
        // every column and excepts only the lifecycle six — so these three are
        // frozen with no trigger change at all.
        const code = await errorCode(() =>
          db().execute(
            sql`update design_versions set ${sql.raw(`"${column}"`)} = null where id = ${id}`,
          ),
        );
        expect(code).toBe(INTEGRITY_VIOLATION);
      },
    );
  });
});
