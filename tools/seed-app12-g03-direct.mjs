/**
 * The database side of the `APP12-G03` seeder: every read, and the **two** writes
 * for which the application has no delivered write authority at all.
 *
 * ## The rule this file lives under
 *
 * `APP12-G03` §1: *"Direct DB writes are allowed only for a prerequisite with no
 * delivered write authority, and only after documenting the missing runtime
 * operation, why the row is required for UAT, and why the write is semantically
 * equivalent to production persistence."* Everything else — categories,
 * Products, media links, SKUs, prices, stock quantities, publication — goes
 * through the delivered Admin HTTP operations in `seed-app12-g03-admin-api.mjs`,
 * and this module must never grow a third exception without the same paperwork.
 *
 * Reads are not exceptions and need none. Reconciling a rerun (§17) means asking
 * what is already there, and the fastest honest way to ask is to ask the
 * database. A read changes nothing.
 *
 * ---
 *
 * ### Exception 1 — `product_variants`
 *
 * **Missing runtime operation.** There is none. The OpenAPI document publishes no
 * operation that creates a variant: `adminSku_create` is `POST
 * /api/admin/products/{productId}/variants/{variantId}/skus` and *requires a
 * variant that already exists*. `DrizzleProductRepository.addVariant` exists in
 * `apps/api` and has **zero non-test callers** — the same shape `APP8-R00` found
 * for `ensureStockRow` before `APP8-B01` gave it one. No Admin screen, service
 * or controller reaches it.
 *
 * **Why the row is required for UAT.** §9 asks for a Product with multiple
 * variants and a Product with multiple SKUs, and §23.20/§23.21 make both
 * acceptance criteria. A SKU cannot exist without its variant
 * (`fk_skus__product_variant_id`), so with no variant row there is no purchasable
 * catalog at all — not merely thinner coverage.
 *
 * **Why it is semantically equivalent.** The insert writes exactly the columns
 * `addVariant` writes, with the same defaults (`is_active` true, explicit
 * `display_order`) and the same generated-id shape. `product_variants` carries no
 * status machine, no audit obligation and no outbox event — it is a leaf
 * describing colour and size — so there is no lifecycle for a direct write to
 * skip. Every consequence of a variant existing (its SKU, its price, its stock,
 * its availability) is then produced by delivered operations that read it.
 *
 * ### Exception 2 — `sku_stocks.low_stock_threshold`
 *
 * **Missing runtime operation.** `adminSkuStock_adjust` is `.strict()` and names
 * `lowStockThreshold` among the fields that are *unrepresentable by design*:
 * "server-owned or repository-owned … Sent, any of them is a `400` naming the
 * unrecognised key." No other operation writes it. So the column has a reader
 * (`AdminSkuStockResponse.lowStock`) and no writer anywhere in the system.
 *
 * **Why the row is required for UAT.** §11 and §23.25 require at least one
 * low-stock SKU. `lowStock` is computed as `quantityOnHand <= lowStockThreshold`
 * and is `false` whenever the threshold is unset, so with no threshold **no SKU
 * can ever report low stock** and the criterion is unsatisfiable through any
 * quantity. The quantity itself is never written here: it is moved only by the
 * audited `adminSkuStock_adjust`.
 *
 * **Why it is semantically equivalent.** The threshold is a display annotation on
 * an anchor row the delivered provisioner already created. It takes part in no
 * transition, no ledger entry and no reservation arithmetic; setting it changes
 * what the Admin screen calls the stock level, not what the stock is.
 */
import { createRequire } from 'node:module';

const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const { Client } = databaseRequire('pg');
/**
 * The system's single vetted RFC 9562 source, resolved from the workspace that
 * declares it. `packages/database`'s `newId()` is "never `Math.random`, never a
 * second library", and a variant id minted by `gen_random_uuid()` would be a
 * v4 in a table every other row of which is a time-ordered v7.
 */
const { uuidv7 } = databaseRequire('uuidv7');

/**
 * Refuses to run against anything but the shared development database.
 *
 * The inverse of the guard every disposable fixture carries. Those refuse the
 * persistent database; G03 is the one checkpoint authorised to write it
 * (§2, `G03_PERSISTENT_DATA_WRITE = AUTHORIZED`), so the mistake worth catching
 * here is the opposite one — pointing the persistent seeder at a leftover
 * `embroidery_db7_*` and reporting a UAT baseline that vanishes with the next
 * `drop database`.
 */
export function assertPersistentDatabase(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-G03 UAT baseline into the disposable database "${name}". ` +
        'G03 owns persistent data; a disposable database is dropped with its run.',
    );
  }
  return name;
}

/** Opens a client against the shared development database. */
export async function openDatabase(databaseUrl) {
  assertPersistentDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

/**
 * The row counts the report's before/after table (§22, §X) is built from.
 *
 * Both halves matter. The catalog counts prove the baseline arrived; the
 * commercial counts prove it arrived **without** the customers, orders and
 * payment obligations §15 forbids, and they are recorded before as well as after
 * so "unchanged" is a measurement rather than an assurance.
 */
export async function countWorld(client) {
  const { rows } = await client.query(`
    select
      (select count(*) from categories)                                  as categories,
      (select count(*) from categories where status = 'PUBLISHED')       as categories_published,
      (select count(*) from products)                                    as products,
      (select count(*) from products where status = 'PUBLISHED')         as products_published,
      (select count(*) from product_variants)                            as variants,
      (select count(*) from skus)                                        as skus,
      (select count(*) from sku_stocks)                                  as sku_stocks,
      (select count(*) from product_media)                               as product_media,
      (select count(*) from assets)                                      as assets,
      (select count(*) from asset_derivatives)                           as asset_derivatives,
      (select count(*) from inventory_ledger_entries)                    as ledger_entries,
      (select count(*) from customers)                                   as customers,
      (select count(*) from orders)                                      as orders,
      (select count(*) from order_items)                                 as order_items,
      (select count(*) from payment_obligations)                         as payment_obligations,
      (select count(*) from payment_attempts)                            as payment_attempts,
      (select count(*) from secure_access_grants)                        as secure_access_grants
  `);
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
}

/**
 * A fingerprint of every row G03 does **not** own, so §22's "unrelated rows
 * modified = 0" is proved rather than asserted.
 *
 * `updated_at` is included in the digest: a row that was merely re-saved with
 * identical values still moves it, so a stray write cannot hide behind an
 * unchanged column set. The G03 rows are excluded by the same slug and code
 * markers the dataset uses — nothing else — so the fingerprint is exactly "the
 * world minus what this checkpoint declared".
 */
export async function fingerprintUnrelated(client, { slugPrefix, skuPrefix }) {
  const { rows } = await client.query(
    `
    select
      md5(coalesce(string_agg(t, '|' order by t), '')) as digest,
      count(*)                                          as rows
    from (
      select concat_ws(':', 'c', id::text, slug, name, status, is_indexable::text,
                       display_order::text, updated_at::text) as t
        from categories where slug not like $1
      union all
      select concat_ws(':', 'p', id::text, slug, name, status, base_price_amount::text,
                       category_id::text, updated_at::text)
        from products where slug not like $1
      union all
      select concat_ws(':', 'v', v.id::text, v.product_id::text, coalesce(v.color_name, ''),
                       coalesce(v.size_label, ''), v.display_order::text, v.updated_at::text)
        from product_variants v join products p on p.id = v.product_id where p.slug not like $1
      union all
      select concat_ws(':', 's', id::text, code, coalesce(price_override_amount::text, ''),
                       is_active::text, updated_at::text)
        from skus where code not like $2
      union all
      select concat_ws(':', 'm', m.id::text, m.product_id::text, m.asset_id::text, m.role,
                       m.display_order::text)
        from product_media m join products p on p.id = m.product_id where p.slug not like $1
    ) as world(t)
  `,
    [`${slugPrefix}%`, `${skuPrefix}%`],
  );
  return { digest: rows[0].digest, rows: Number(rows[0].rows) };
}

/**
 * **Exception 1.** Ensures one `product_variants` row, matched on its business
 * identity rather than on an id the seeder would have to remember.
 *
 * Idempotent by that identity: `(product_id, color_name, size_label)` is what an
 * operator means by "the Kem one", so a rerun finds it instead of adding a
 * second. The table carries no unique constraint on that triple — this is a
 * lookup-then-insert, not an upsert — which is correct here because the seeder
 * is the only writer and runs alone.
 */
export async function ensureVariant(client, { productId, colorName, sizeLabel, displayOrder }) {
  const existing = await client.query(
    `select id, display_order, is_active from product_variants
      where product_id = $1
        and color_name is not distinct from $2
        and size_label is not distinct from $3`,
    [productId, colorName ?? null, sizeLabel ?? null],
  );
  const found = existing.rows[0];
  if (found !== undefined) {
    return { variantId: found.id, created: false };
  }
  const { rows } = await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($5, $1, $2, $3, $4, true)
     returning id`,
    [productId, colorName ?? null, sizeLabel ?? null, displayOrder, uuidv7()],
  );
  return { variantId: rows[0].id, created: true };
}

/**
 * **Exception 2.** Sets the low-stock threshold on an anchor the delivered
 * provisioner already created.
 *
 * Deliberately an `update`, never an insert: if no `sku_stocks` row exists the
 * seeder has called this before the delivered stock adjustment, and that is a
 * sequencing bug worth failing on rather than papering over by creating the
 * anchor here — creating it is `SkuStockAnchorProvisioner`'s job.
 */
export async function setLowStockThreshold(client, { skuId, threshold }) {
  const { rowCount } = await client.query(
    `update sku_stocks set low_stock_threshold = $2, updated_at = now() where sku_id = $1`,
    [skuId, threshold ?? null],
  );
  if (rowCount === 0) {
    throw new Error(
      `APP12-G03: no sku_stocks anchor for SKU ${skuId}. The delivered stock adjustment must ` +
        'run before the threshold is set.',
    );
  }
}

/** Resolves the SKU ids the Admin API creates but never lists back by code. */
export async function findSkusByCode(client, codes) {
  const { rows } = await client.query(
    `select s.id, s.code, s.product_variant_id, s.price_override_amount, s.is_active
       from skus s where s.code = any($1::text[])`,
    [codes],
  );
  return new Map(rows.map((row) => [row.code, row]));
}

/** The variants of one Product, in stored order. */
export async function listVariants(client, productId) {
  const { rows } = await client.query(
    `select id, color_name, size_label, display_order, is_active
       from product_variants where product_id = $1 order by display_order, id`,
    [productId],
  );
  return rows;
}

/**
 * Everything the manifest (§16) records, read back from the persisted truth
 * rather than from what the seeder believes it wrote.
 *
 * That distinction is the point of §36 ("manifest reconciles to persisted
 * truth"): a manifest generated from the seeder's intentions would agree with
 * itself no matter what the database contains.
 */
export async function readG03Truth(client, { slugPrefix, skuPrefix }) {
  const categories = await client.query(
    `select id, slug, name, status, is_indexable, display_order, archived_at
       from categories where slug like $1 order by display_order, slug`,
    [`${slugPrefix}%`],
  );
  const products = await client.query(
    `select p.id, p.slug, p.name, p.status, p.base_price_amount, p.currency_code,
            p.is_indexable, p.description, c.id as category_id, c.slug as category_slug
       from products p join categories c on c.id = p.category_id
      where p.slug like $1 order by p.slug`,
    [`${slugPrefix}%`],
  );
  const media = await client.query(
    `select m.product_id, m.asset_id, m.role, m.display_order,
            a.status as asset_status, a.size_bytes, a.deleted_at as asset_deleted_at,
            (select count(*) from asset_derivatives d
              where d.asset_id = a.id and d.kind = 'THUMBNAIL' and d.status = 'READY')
              as thumbnail_ready,
            (select count(*) from asset_derivatives d
              where d.asset_id = a.id and d.kind = 'CATALOG_PREVIEW' and d.status = 'READY')
              as catalog_preview_ready
       from product_media m
       join assets a on a.id = m.asset_id
       join products p on p.id = m.product_id
      where p.slug like $1 order by m.product_id, m.display_order`,
    [`${slugPrefix}%`],
  );
  const skus = await client.query(
    `select s.id, s.code, s.price_override_amount, s.is_active, s.product_variant_id,
            v.product_id, v.color_name, v.size_label, v.display_order,
            st.quantity_on_hand, st.low_stock_threshold,
            coalesce((select sum(r.quantity) from inventory_reservations r
                       where r.sku_stock_id = st.id and r.status = 'ACTIVE'), 0) as reserved
       from skus s
       join product_variants v on v.id = s.product_variant_id
       left join sku_stocks st on st.sku_id = s.id
      where s.code like $1 order by v.display_order, s.code`,
    [`${skuPrefix}%`],
  );
  return {
    categories: categories.rows,
    products: products.rows,
    media: media.rows,
    skus: skus.rows,
  };
}
