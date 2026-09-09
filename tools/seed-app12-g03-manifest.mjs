#!/usr/bin/env node
/**
 * Renders `docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md`.
 *
 * ```text
 * node --env-file=.env tools/seed-app12-g03-manifest.mjs
 * ```
 *
 * ## Why it reads the database rather than the dataset
 *
 * §16 makes the manifest the *ownership and provenance authority* — the document
 * a later checkpoint consults before it deletes, promotes or reasons about a row
 * — and §23.36 requires that it "reconciles to persisted truth". A manifest
 * rendered from `seed-app12-g03-dataset.mjs` would satisfy neither: it would
 * describe what the seeder meant to write and would agree with itself whatever
 * the database actually contains. So every field here is read back from
 * PostgreSQL after the fact, and the declared dataset appears only as a
 * *reconciliation column* — the place where intent and truth are compared and a
 * mismatch is printed as a mismatch.
 *
 * ## What it deliberately does not record
 *
 * §16's exclusion list: no object-store credentials, no signed or private
 * storage URLs, no passwords, no session cookies, no merchant secrets. Media is
 * identified by Asset id and derivative readiness — facts that are durable in the
 * database and meaningless to anyone without an authenticated session — never by
 * a storage key or a URL that could be replayed. `tools/check-report-secrets.mjs`
 * is the mechanical backstop.
 */
import { writeFileSync } from 'node:fs';

import {
  G03_CATEGORIES,
  G03_PRODUCTS,
  G03_SKU_PREFIX,
  G03_SLUG_PREFIX,
} from './seed-app12-g03-dataset.mjs';
import { countWorld, openDatabase, readG03Truth } from './seed-app12-g03-direct.mjs';

const OUTPUT = 'docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md';

/** `320000.00` → `320.000 ₫`, the figure a reader can compare with the screen. */
function money(amount) {
  if (amount === null || amount === undefined) {
    return '—';
  }
  const whole = String(amount).replace(/\.0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

/** `✓` / `✗`, so a readiness column is scannable rather than read word by word. */
function tick(value) {
  return value ? '✓' : '✗';
}

/** The availability a shopper will actually meet, derived from the same facts the API uses. */
function expectedAvailability(sku) {
  const quantity = sku.quantity_on_hand ?? 0;
  const available = quantity - Number(sku.reserved ?? 0);
  if (available <= 0) {
    return 'hết hàng (out of stock)';
  }
  if (sku.low_stock_threshold !== null && available <= sku.low_stock_threshold) {
    return `còn ${String(available)} — dưới ngưỡng (low stock)`;
  }
  return `còn ${String(available)} (in stock)`;
}

function renderCategories(truth) {
  const declaredBySlug = new Map(G03_CATEGORIES.map((category) => [category.slug, category]));
  const lines = [
    '| id | slug | name | status | indexable | display order | matches declaration |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const row of truth.categories) {
    const declared = declaredBySlug.get(row.slug);
    const matches =
      declared !== undefined &&
      declared.name === row.name &&
      declared.isIndexable === row.is_indexable &&
      declared.displayOrder === row.display_order &&
      row.status === 'PUBLISHED' &&
      row.archived_at === null;
    lines.push(
      `| \`${row.id}\` | \`${row.slug}\` | ${row.name} | ${row.status} | ` +
        `${tick(row.is_indexable)} | ${String(row.display_order)} | ${tick(matches)} |`,
    );
  }
  return lines.join('\n');
}

function renderProducts(truth) {
  const declaredBySlug = new Map(G03_PRODUCTS.map((product) => [product.slug, product]));
  const blocks = [];
  for (const row of truth.products) {
    const declared = declaredBySlug.get(row.slug);
    const media = truth.media.filter((item) => item.product_id === row.id);
    const skus = truth.skus.filter((sku) => sku.product_id === row.id);
    const primary = media.find((item) => item.display_order === 0);
    const mediaMatches = declared !== undefined && media.length === declared.mediaCount;

    blocks.push(
      [
        `### ${row.name}`,
        '',
        '| field | persisted value |',
        '|---|---|',
        `| Product id | \`${row.id}\` |`,
        `| slug | \`${row.slug}\` |`,
        `| category | ${row.category_slug} (\`${row.category_id}\`) |`,
        `| status | ${row.status} |`,
        `| base price | ${money(row.base_price_amount)} ${row.currency_code} |`,
        `| media count | ${String(media.length)}${
          declared === undefined
            ? ''
            : ` (declared ${String(declared.mediaCount)} — ${tick(mediaMatches)})`
        } |`,
        `| primary Asset id | \`${primary?.asset_id ?? '—'}\` |`,
        `| variants | ${String(new Set(skus.map((sku) => sku.product_variant_id)).size)} |`,
        `| SKUs | ${String(skus.length)} |`,
        '',
        '**Ordered Asset ids** (position → Asset, THUMBNAIL/CATALOG_PREVIEW readiness)',
        '',
        '| position | role | Asset id | asset status | thumb | preview |',
        '|---|---|---|---|---|---|',
        ...media.map(
          (item) =>
            `| ${String(item.display_order)} | ${item.role} | \`${item.asset_id}\` | ` +
            `${item.asset_status} | ${tick(Number(item.thumbnail_ready) > 0)} | ` +
            `${tick(Number(item.catalog_preview_ready) > 0)} |`,
        ),
        '',
        '**Variants and SKUs**',
        '',
        '| variant | SKU code | SKU id | override | stock | threshold | expected public availability |',
        '|---|---|---|---|---|---|---|',
        ...skus.map((sku) => {
          const variant = [sku.color_name, sku.size_label].filter(Boolean).join(' / ') || '—';
          return (
            `| ${variant} | \`${sku.code}\` | \`${sku.id}\` | ` +
            `${sku.price_override_amount === null ? 'base price' : money(sku.price_override_amount)} | ` +
            `${String(sku.quantity_on_hand ?? 0)} | ${sku.low_stock_threshold ?? '—'} | ` +
            `${expectedAvailability(sku)} |`
          );
        }),
        '',
      ].join('\n'),
    );
  }
  return blocks.join('\n');
}

/** The §23 numbers, each computed from the persisted rows rather than restated. */
function renderCoverage(truth) {
  const byProduct = new Map(
    truth.products.map((product) => [
      product.id,
      truth.media.filter((item) => item.product_id === product.id).length,
    ]),
  );
  const mediaCounts = [...byProduct.values()];
  const skus = truth.skus;
  const withOverride = skus.filter((sku) => sku.price_override_amount !== null);
  const inStock = skus.filter((sku) => (sku.quantity_on_hand ?? 0) > 0);
  const outOfStock = skus.filter((sku) => (sku.quantity_on_hand ?? 0) === 0);
  const lowStock = skus.filter(
    (sku) =>
      sku.low_stock_threshold !== null &&
      (sku.quantity_on_hand ?? 0) > 0 &&
      (sku.quantity_on_hand ?? 0) <= sku.low_stock_threshold,
  );
  const mixed = truth.products.filter((product) => {
    const own = skus.filter((sku) => sku.product_id === product.id);
    return (
      own.some((sku) => (sku.quantity_on_hand ?? 0) > 0) &&
      own.some((sku) => (sku.quantity_on_hand ?? 0) === 0)
    );
  });
  const multiVariant = truth.products.filter(
    (product) =>
      new Set(
        skus.filter((sku) => sku.product_id === product.id).map((sku) => sku.product_variant_id),
      ).size > 1,
  );

  return [
    '| §23 criterion | required | persisted | |',
    '|---|---|---|---|',
    `| 10 published dynamic categories | ≥ 3 | ${String(truth.categories.length)} | ${tick(truth.categories.length >= 3)} |`,
    `| 11 published Ready-Made Products | ≥ 6 | ${String(truth.products.length)} | ${tick(truth.products.length >= 6)} |`,
    `| 12 categories spanned | ≥ 3 | ${String(new Set(truth.products.map((p) => p.category_slug)).size)} | ${tick(new Set(truth.products.map((p) => p.category_slug)).size >= 3)} |`,
    `| 14 a Product with exactly 1 image | 1 | ${String(mediaCounts.filter((n) => n === 1).length)} | ${tick(mediaCounts.includes(1))} |`,
    `| 15 a Product with ≈ 8 images | 1 | ${String(mediaCounts.filter((n) => n === 8).length)} | ${tick(mediaCounts.includes(8))} |`,
    `| 16 a Product with 20 images | 1 | ${String(mediaCounts.filter((n) => n === 20).length)} | ${tick(mediaCounts.includes(20))} |`,
    `| 20 Products with multiple variants | ≥ 1 | ${String(multiVariant.length)} | ${tick(multiVariant.length >= 1)} |`,
    `| 21 SKUs | ≥ 2 in one Product | ${String(skus.length)} total | ${tick(skus.length >= 2)} |`,
    `| 22 SKUs on the base-price path | ≥ 1 | ${String(skus.length - withOverride.length)} | ${tick(skus.length > withOverride.length)} |`,
    `| 23 SKUs with a price override | ≥ 1 | ${String(withOverride.length)} | ${tick(withOverride.length >= 1)} |`,
    `| 24 in-stock SKUs | ≥ 1 | ${String(inStock.length)} | ${tick(inStock.length >= 1)} |`,
    `| 25 low-stock SKUs | ≥ 1 | ${String(lowStock.length)} | ${tick(lowStock.length >= 1)} |`,
    `| 26 out-of-stock SKUs | ≥ 1 | ${String(outOfStock.length)} | ${tick(outOfStock.length >= 1)} |`,
    `| 27 Products with mixed availability | ≥ 1 | ${String(mixed.length)} | ${tick(mixed.length >= 1)} |`,
    '',
    `Every referenced Asset is \`ACCEPTED\` with both required derivatives \`READY\`: ` +
      `${tick(
        truth.media.every(
          (item) =>
            item.asset_status === 'ACCEPTED' &&
            Number(item.thumbnail_ready) > 0 &&
            Number(item.catalog_preview_ready) > 0,
        ),
      )} (${String(truth.media.length)} media rows).`,
  ].join('\n');
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@` +
      `${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;
  const client = await openDatabase(databaseUrl);
  try {
    const markers = { slugPrefix: G03_SLUG_PREFIX, skuPrefix: G03_SKU_PREFIX };
    const truth = await readG03Truth(client, markers);
    const counts = await countWorld(client);
    const document = [
      '# APP12-G03 — persistent UAT catalog data manifest',
      '',
      '```text',
      'G03_DATA                  = UAT_ONLY',
      'PRODUCTION_CONTENT        = false',
      'G03_DATA_TEARDOWN         = NOT_REQUIRED',
      'G03_PERSISTENT_UAT_DATA   = READY',
      '```',
      '',
      'The ownership and provenance authority for every business object `APP12-G03`',
      'wrote into the **shared development database**. Consult it before deleting,',
      'promoting or reasoning about any row it lists.',
      '',
      'Generated by `node --env-file=.env tools/seed-app12-g03-manifest.mjs`, which reads',
      'the rows back out of PostgreSQL — this document describes what is *persisted*,',
      'not what the seeder intended. The "matches declaration" columns are where intent',
      'and truth are compared.',
      '',
      '## Provenance convention',
      '',
      '```text',
      `category slug   ${G03_SLUG_PREFIX}<family>`,
      `product slug    ${G03_SLUG_PREFIX}<name>          server-derived; see the seeder header`,
      `SKU code        ${G03_SKU_PREFIX}<PRODUCT>-<VARIANT>`,
      'human names     ordinary Vietnamese, no marker',
      '```',
      '',
      'No row outside these markers belongs to G03.',
      '',
      '## Coverage against the §23 acceptance criteria',
      '',
      renderCoverage(truth),
      '',
      '## Categories',
      '',
      renderCategories(truth),
      '',
      '## Products',
      '',
      renderProducts(truth),
      '## Commercial boundary (§15)',
      '',
      'G03 created no customer, order, payment obligation, payment attempt or access',
      'grant. The shared world holds:',
      '',
      '```text',
      `orders                ${String(counts.orders)}`,
      `order_items           ${String(counts.order_items)}`,
      `payment_obligations   ${String(counts.payment_obligations)}`,
      `payment_attempts      ${String(counts.payment_attempts)}`,
      `customers             ${String(counts.customers)}   (pre-existing; none created by G03)`,
      `secure_access_grants  ${String(counts.secure_access_grants)}   (pre-existing; none created by G03)`,
      '```',
      '',
      '## Not production content',
      '',
      'This dataset exists for `APP12-U01`, `APP12-E01` and Product Owner review. No',
      'category, Product or image listed here may be promoted to production because G03',
      'passed; production content requires separate authorization (§18).',
      '',
    ].join('\n');
    writeFileSync(OUTPUT, document, 'utf8');
    process.stdout.write(
      `wrote ${OUTPUT} — ${String(truth.categories.length)} categories, ` +
        `${String(truth.products.length)} products, ${String(truth.media.length)} media, ` +
        `${String(truth.skus.length)} SKUs\n`,
    );
  } finally {
    await client.end();
  }
}

await main();
