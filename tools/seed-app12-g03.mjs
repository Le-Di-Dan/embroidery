#!/usr/bin/env node
/**
 * `APP12-G03` — the persistent representative UAT catalog baseline.
 *
 * ```text
 * node --env-file=.env tools/seed-app12-g03.mjs [--dry-run]
 * ```
 *
 * `--env-file` is not a convenience. `STAFF_BOOTSTRAP_PASSWORD` is a protected
 * variable (`.env-ignore`), and the one handling `CLAUDE.md` §8a permits without
 * asking is exactly this: hand the file to the tooling that consumes it, so the
 * secret goes file → process and is never read out, echoed, logged or passed as
 * an argument. Nothing in this tree prints it, and `redact()` in the API client
 * is the backstop if a future change tries to.
 *
 * ## What this owns
 *
 * `APP12-G03` is the **sole persistent UAT-data owner** (§2). Every prior APP12
 * fixture was disposable and refused to run against anything but an
 * `embroidery_db7_*` database; this one refuses the opposite, and the data it
 * writes is deliberately retained for `APP12-U01`, `APP12-E01` and Product Owner
 * review. `G03_DATA_TEARDOWN = NOT_REQUIRED`.
 *
 * The permission is narrow. This tool writes categories, Products, media,
 * variants, SKUs, prices and stock, all under the `uat-` / `UAT-G03-` markers,
 * and it writes nothing else — no customers, no orders, no payment obligations,
 * no grants (§15). It never deletes, renames or mutates a row it did not create:
 * the `fingerprintUnrelated` digest taken before and after is what proves that
 * rather than asserting it.
 *
 * ## The shape of a run
 *
 * ```text
 * preflight   read-only counts + a digest of everything G03 does not own
 * categories  adminCategory_create / _update / _transition
 * products    adminProduct_create, then per Product:
 *               adminAsset_upload ×N  → the real inspection/derivation pipeline
 *               adminProduct_update   → name, description, price, ordered media
 *               product_variants      → direct (exception 1, documented)
 *               adminSku_create/_update, adminSkuStock_adjust
 *               sku_stocks.low_stock_threshold → direct (exception 2, documented)
 *               adminProduct_publish  → through the real publication gate
 * verify      counts again, digest again, and the unrelated digest must match
 * ```
 *
 * Safe to interrupt and safe to rerun (§17): every step looks its object up by
 * business key first, uploads are keyed by a deterministic `Idempotency-Key`, and
 * stock moves by the difference rather than by a fixed delta.
 */
import { createRequire } from 'node:module';
import { sep } from 'node:path';

import { AdminApiSession } from './seed-app12-g03-admin-api.mjs';
import {
  DataCollisionError,
  ensureProduct,
  ensureProductAssets,
  publishProduct,
  reconcileCategory,
  reconcileProductFields,
  reconcileVariantSku,
} from './seed-app12-g03-catalog.mjs';
import {
  G03_CATEGORIES,
  G03_PRODUCTS,
  G03_SKU_PREFIX,
  G03_SLUG_PREFIX,
  totalMediaCount,
} from './seed-app12-g03-dataset.mjs';
import {
  countWorld,
  fingerprintUnrelated,
  findSkusByCode,
  openDatabase,
} from './seed-app12-g03-direct.mjs';

/** `sharp` belongs to `apps/worker`, the workspace that owns the image pipeline. */
const workerRequire = createRequire(new URL('../apps/worker/package.json', import.meta.url));

const MARKERS = Object.freeze({ slugPrefix: G03_SLUG_PREFIX, skuPrefix: G03_SKU_PREFIX });

function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * Reads configuration from the process environment.
 *
 * `DATABASE_URL` is protected by `.env-ignore` because it embeds the password;
 * it is used to *open a connection* and is never printed. The database name is
 * echoed, which is not the secret and is the one fact an operator needs in order
 * to confirm the tool is pointed where they think.
 */
function readConfig(env) {
  const missing = ['ADMIN_HOST', 'STAFF_BOOTSTRAP_EMAIL', 'STAFF_BOOTSTRAP_PASSWORD'].filter(
    (name) => (env[name] ?? '') === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `APP12-G03 seeder: ${missing.join(', ')} not set. Run it as ` +
        '`node --env-file=.env tools/seed-app12-g03.mjs`.',
    );
  }
  const databaseUrl =
    env.DATABASE_URL ??
    `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${env.POSTGRES_HOST}:` +
      `${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;
  return {
    adminOrigin: `http://${env.ADMIN_HOST}`,
    email: env.STAFF_BOOTSTRAP_EMAIL,
    secret: env.STAFF_BOOTSTRAP_PASSWORD,
    databaseUrl,
  };
}

/** Indexes the Admin category list by slug. */
async function loadCategories(session) {
  const page = await session.request('adminCategory_list', {
    method: 'GET',
    path: '/api/admin/categories',
  });
  return new Map(page.items.map((item) => [item.slug, item]));
}

/** Every Product already filed under one of the G03 categories, indexed by slug. */
async function loadProducts(session, categorySlugs) {
  const bySlug = new Map();
  for (const categorySlug of categorySlugs) {
    let cursor;
    do {
      const query = new URLSearchParams({ categorySlug, limit: '100' });
      if (cursor !== undefined) {
        query.set('cursor', cursor);
      }
      const page = await session.request('adminProduct_list', {
        method: 'GET',
        path: `/api/admin/products?${query.toString()}`,
      });
      for (const item of page.items) {
        bySlug.set(item.slug, item);
      }
      cursor = page.hasNext ? page.nextCursor : undefined;
    } while (cursor !== undefined);
  }
  return bySlug;
}

/** Brings the four dynamic categories to PUBLISHED. */
async function seedCategories(session) {
  const existing = await loadCategories(session);
  const bySlug = new Map();
  for (const declared of G03_CATEGORIES) {
    const category = await reconcileCategory(session, {
      existing: existing.get(declared.slug),
      declared,
      log,
    });
    bySlug.set(declared.key, category);
  }
  return bySlug;
}

/** Brings one Product, with its media, variants, SKUs, stock and status, to PUBLISHED. */
async function seedProduct(session, client, { declared, categories, existing, sharp }) {
  const category = categories.get(declared.categoryKey);
  if (category === undefined) {
    throw new Error(`APP12-G03: product ${declared.slug} names unknown category key.`);
  }

  let product = await ensureProduct(session, {
    existing,
    declared: { ...declared, categorySlugValue: category.slug },
    log,
  });

  const assetIds = await ensureProductAssets(session, { declared, sharp, log });
  product = await reconcileProductFields(session, { product, declared, assetIds, log });

  const existingSkus = await findSkusByCode(
    client,
    declared.variants.map((variant) => variant.sku.code),
  );
  const skus = [];
  for (const [index, variant] of declared.variants.entries()) {
    skus.push(
      await reconcileVariantSku(session, client, {
        productId: product.productId,
        declared: variant,
        variantIndex: index,
        existingSku: existingSkus.get(variant.sku.code),
        log,
      }),
    );
  }

  product = await publishProduct(session, { product, log });
  return { product, assetIds, skus };
}

/**
 * `--only=tui-tote,goi-sen` — the dataset keys this run should touch.
 *
 * A resume aid, not a scope change: the dataset is unchanged and a later
 * unfiltered run still reconciles everything. Returns `undefined` when the flag
 * is absent, which means "all".
 */
export function readOnlyFilter(argv) {
  const flag = argv.find((argument) => argument.startsWith('--only='));
  if (flag === undefined) {
    return undefined;
  }
  const keys = flag
    .slice('--only='.length)
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '');
  const known = new Set(G03_PRODUCTS.map((product) => product.key));
  const unknown = keys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(`--only names unknown dataset keys: ${unknown.join(', ')}`);
  }
  return new Set(keys);
}

/** Renders the before/after count table §22 asks for. */
function reportCounts(before, after) {
  log('');
  log('  metric                    before    after     delta');
  log('  ------------------------- --------- --------- -------');
  for (const key of Object.keys(before)) {
    const delta = after[key] - before[key];
    log(
      `  ${key.padEnd(25)} ${String(before[key]).padStart(9)} ${String(after[key]).padStart(9)} ` +
        `${(delta >= 0 ? `+${String(delta)}` : String(delta)).padStart(7)}`,
    );
  }
}

async function main() {
  const config = readConfig(process.env);
  const dryRun = process.argv.includes('--dry-run');
  const client = await openDatabase(config.databaseUrl);
  const session = new AdminApiSession({ baseUrl: config.adminOrigin, secret: config.secret });

  try {
    const before = await countWorld(client);
    const digestBefore = await fingerprintUnrelated(client, MARKERS);
    log(`APP12-G03 preflight — database "${new URL(config.databaseUrl).pathname.slice(1)}"`);
    log(
      `  ${String(before.categories)} categories, ${String(before.products)} products, ` +
        `${String(before.skus)} SKUs, ${String(before.orders)} orders`,
    );
    log(`  unrelated fingerprint ${digestBefore.digest} over ${String(digestBefore.rows)} rows`);
    log(
      `  dataset: ${String(G03_CATEGORIES.length)} categories, ` +
        `${String(G03_PRODUCTS.length)} products, ${String(totalMediaCount())} images`,
    );

    if (dryRun) {
      log('\n--dry-run: nothing written.');
      return;
    }

    const sharp = workerRequire('sharp');
    await session.login(config.email);
    log('\nAPP12-G03 seeding through the delivered Admin operations…\n');

    const categories = await seedCategories(session);
    const declaredProducts = await loadProducts(
      session,
      G03_CATEGORIES.map((category) => category.slug),
    );
    // `--only` narrows a rerun to named dataset keys. The categories are always
    // reconciled first, because a Product cannot publish under an unpublished one.
    const only = readOnlyFilter(process.argv);
    for (const declared of G03_PRODUCTS) {
      if (only !== undefined && !only.has(declared.key)) {
        continue;
      }
      await seedProduct(session, client, {
        declared,
        categories,
        existing: declaredProducts.get(declared.slug),
        sharp,
      });
    }

    const after = await countWorld(client);
    const digestAfter = await fingerprintUnrelated(client, MARKERS);
    reportCounts(before, after);
    log('');
    if (digestAfter.digest !== digestBefore.digest) {
      throw new Error(
        'APP12-G03 wrote outside its own dataset: the fingerprint of unrelated catalog rows ' +
          `changed (${digestBefore.digest} → ${digestAfter.digest}).`,
      );
    }
    log(`  unrelated rows unchanged (${digestAfter.digest}, ${String(digestAfter.rows)} rows)`);
    for (const key of ['customers', 'orders', 'order_items', 'payment_obligations']) {
      if (after[key] !== before[key]) {
        throw new Error(
          `APP12-G03 §15 violation: ${key} moved ${String(before[key])} → ${String(after[key])}.`,
        );
      }
    }
    log('  commercial tables unchanged (§15)');
    log('\nAPP12-G03 seeding complete.');
  } finally {
    await session.logout();
    await client.end();
  }
}

// Only when this file *is* the command. `seed-app12-g03.test.mjs` imports
// `readOnlyFilter` from here, and a module that seeded a catalog as a side
// effect of being imported would be a trap — the test run would write to the
// shared development database.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  try {
    await main();
  } catch (error) {
    if (error instanceof DataCollisionError) {
      process.stderr.write(`\n${error.message}\nStopped without writing further.\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`\nAPP12-G03 seeder failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
