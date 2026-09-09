#!/usr/bin/env node
/**
 * `APP12-U01` shared-source integrity probe — **read-only, always**.
 *
 * U01 is business UAT run against a *disposable clone* of the shared
 * development world. §3 of the brief makes the shared world read-only for the
 * whole checkpoint and §24 demands an exit proof that it is unchanged, so the
 * run needs one instrument that can be pointed at the shared database twice and
 * compared byte for byte.
 *
 * It issues nothing but `select`. There is no write path in this file, and the
 * session is put into `read only` transaction characteristics, so a future edit
 * that added one would be refused by PostgreSQL rather than by a reviewer.
 *
 * Output is a stable JSON digest on stdout: commercial counts, the G03 catalog
 * census and a SHA-256 over the ordered identity + business columns of every G03
 * row. A single changed price, stock quantity, media position or status moves
 * the digest.
 *
 * Usage: `node --env-file=.env tools/uat-app12-u01-integrity.mjs [label]`
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

/** `pg` is declared by the workspace that owns the database, not by `tools/`. */
const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const { Client } = databaseRequire('pg');

/** Tables whose row count must not move while U01 runs (§3, §24). */
const COMMERCIAL_TABLES = Object.freeze([
  'customers',
  'customer_contact_points',
  'orders',
  'order_items',
  'order_transitions',
  'payment_obligations',
  'payment_attempts',
  'payment_transfer_evidence',
  'inventory_reservations',
  'inventory_ledger_entries',
  'shipping_details',
  'shipping_snapshots',
  'secure_access_grants',
  'contact_verification_challenges',
  'contact_verification_attempts',
  'idempotency_records',
  'notification_intents',
  'notification_delivery_attempts',
]);

/** Catalog tables the G03 baseline owns (§2). */
const CATALOG_TABLES = Object.freeze([
  'categories',
  'products',
  'product_variants',
  'skus',
  'sku_stocks',
  'product_media',
  'assets',
  'asset_derivatives',
]);

/**
 * The ordered census of every G03 row, as one deterministic text stream.
 *
 * Every column a UAT journey could plausibly disturb is in here — status, price,
 * stock, threshold, media position and role — because a digest that covered only
 * identities would call a silently re-priced SKU "unchanged".
 */
const CENSUS_QUERIES = Object.freeze({
  categories: `select id::text, slug, name, status, display_order::text, is_indexable::text
               from categories where slug like 'uat-%' order by slug`,
  products: `select p.id::text, p.slug, p.name, p.status, p.base_price_amount::text,
                    p.currency_code, p.category_id::text
             from products p where p.slug like 'uat-%' order by p.slug`,
  variants: `select v.id::text, p.slug, coalesce(v.color_name,''), coalesce(v.size_label,''),
                    v.display_order::text, v.is_active::text
             from product_variants v join products p on p.id = v.product_id
             where p.slug like 'uat-%' order by p.slug, v.display_order, v.id`,
  skus: `select s.id::text, s.code, coalesce(s.price_override_amount::text,''),
                s.currency_code, s.is_active::text,
                coalesce(st.quantity_on_hand::text,''), coalesce(st.low_stock_threshold::text,'')
         from skus s
         join product_variants v on v.id = s.product_variant_id
         join products p on p.id = v.product_id
         left join sku_stocks st on st.sku_id = s.id
         where p.slug like 'uat-%' order by s.code`,
  media: `select m.id::text, p.slug, m.asset_id::text, m.display_order::text, m.role,
                 a.status, a.storage_key
          from product_media m
          join products p on p.id = m.product_id
          join assets a on a.id = m.asset_id
          where p.slug like 'uat-%' order by p.slug, m.display_order`,
});

async function census(client) {
  const out = {};
  for (const [name, sql] of Object.entries(CENSUS_QUERIES)) {
    const { rows } = await client.query(sql);
    out[name] = rows.map((row) => Object.values(row).join('|'));
  }
  return out;
}

async function counts(client, tables) {
  const out = {};
  for (const table of tables) {
    const { rows } = await client.query(`select count(*)::int as n from ${table}`);
    out[table] = rows[0].n;
  }
  return out;
}

/** Connection string from the environment; never printed, never argv. */
export function databaseUrl(env = process.env) {
  const url =
    env.DATABASE_URL ??
    `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@` +
      `${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;
  if (url.includes('undefined')) {
    throw new Error('No database configuration in the environment (use --env-file=.env).');
  }
  return url;
}

export async function probe(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('set session characteristics as transaction read only');
    const { rows: dbRows } = await client.query('select current_database() as name');
    const { rows: tableRows } = await client.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE'`,
    );
    const rows = await census(client);
    const stream = Object.entries(rows)
      .map(([name, lines]) => `${name}\n${lines.join('\n')}`)
      .join('\n--\n');
    return {
      database: dbRows[0].name,
      tables: tableRows[0].n,
      commercial: await counts(client, COMMERCIAL_TABLES),
      catalog: await counts(client, CATALOG_TABLES),
      g03Rows: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])),
      censusDigest: createHash('sha256').update(stream).digest('hex'),
    };
  } finally {
    await client.end();
  }
}

const invoked = process.argv[1]?.replace(/\\/g, '/');
if (invoked !== undefined && import.meta.url.endsWith(invoked.slice(invoked.lastIndexOf('/')))) {
  const label = process.argv[2] ?? 'snapshot';
  probe(databaseUrl())
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ label, ...result }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
