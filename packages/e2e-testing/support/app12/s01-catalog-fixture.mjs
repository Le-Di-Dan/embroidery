/**
 * The `APP12-S01` Ready-Made catalog fixture.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. `VALIDATION_GOVERNANCE.md` §3A.4 and the Product Owner's `APP12-S01`
 * §32 direction both require it: the shared development database carries no
 * purchasable SKU (`APP12-B01-C1` removed the last one against proven
 * provenance), and the authorised persistent catalog dataset is `APP12-G03`'s,
 * under its own authority. So nothing here is cleaned up row by row — the whole
 * database is dropped with the run, which is the only cleanup that cannot leave
 * something behind.
 *
 * `assertDisposable` below refuses to run against anything that is not one, so
 * that rule is enforced rather than remembered.
 *
 * ## Why it writes SQL rather than driving the Admin API
 *
 * `APP12-S01` is a Storefront read checkpoint. Composing this catalog through
 * the Admin surfaces would mean logging a staff user in and exercising APP2,
 * APP7 and APP8 write paths — a great deal of machinery whose failure would look
 * like an S01 defect and would not be one. The rows are written directly, in the
 * shapes the delivered schema declares, and what S01 actually proves is that the
 * **public read** projects them correctly.
 *
 * ## The dataset
 *
 * Two Products under one test-only category, covering the `APP12-S01` §33 matrix
 * that a fixture can express:
 *
 * ```text
 * app12-s01-e2e-ao-thun     Trắng · M   one SKU, 8 available, override 399000
 *                           Trắng · L   one SKU, 0 available          → `· hết`
 *                           Đen   · M   one SKU, 3 available, no override
 *                           Đen   · L   no SKU at all                 → never sellable
 *                           Xanh rêu·M  TWO eligible SKUs             → ambiguous
 *
 * app12-s01-e2e-khan-tay    Trắng · M   no SKU  → the whole Product is unbuyable
 * ```
 *
 * Every business key is prefixed `app12-s01-e2e-` so a row that somehow outlived
 * its database is recognisable as harness debris rather than as catalog an
 * operator authored, and could never be mistaken for `APP12-G03` data.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

const { Client } = pg;

/** The prefix every business key in this fixture carries. */
export const S01_FIXTURE_PREFIX = 'app12-s01-e2e';

export const S01_CATEGORY_SLUG = `${S01_FIXTURE_PREFIX}-do-thu-nghiem`;
/** The Product every purchasable journey runs against. */
export const S01_PURCHASABLE_SLUG = `${S01_FIXTURE_PREFIX}-ao-thun`;
/** The Product that exists, renders and cannot be bought (`APP12-S01` §23). */
export const S01_UNBUYABLE_SLUG = `${S01_FIXTURE_PREFIX}-khan-tay`;

/** The base price both Products publish, before any SKU override. */
export const S01_BASE_PRICE = '450000';
/** The override on `Trắng · M`, deliberately different from the base price. */
export const S01_OVERRIDE_PRICE = '399000';

/**
 * Refuses to touch anything but a disposable database.
 *
 * `createDisposableDatabase` names every database it makes `embroidery_db7_*`,
 * and the persistent development database is plain `embroidery`. Checking the
 * name is what keeps a mistyped `E2E_POSTGRES_PORT` from pointing this at the
 * shared stack on 5434 — the failure mode this guard exists for, because the
 * rows below would be indistinguishable from a real catalog once written.
 */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-S01 fixture into "${name}": only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4.',
    );
  }
  return name;
}

/** One variant plus, optionally, the SKUs and stock behind it. */
async function insertVariant(client, { productId, colorName, sizeLabel, displayOrder, skus }) {
  const variantId = randomUUID();
  await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($1, $2, $3, $4, $5, true)`,
    [variantId, productId, colorName, sizeLabel, displayOrder],
  );

  for (const [index, sku] of skus.entries()) {
    const skuId = randomUUID();
    await client.query(
      `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
       values ($1, $2, $3, $4, 'VND', true)`,
      [
        skuId,
        variantId,
        `${S01_FIXTURE_PREFIX}-${String(colorName ?? 'x')}-${String(sizeLabel ?? 'x')}-${String(index)}`,
        sku.priceOverride ?? null,
      ],
    );
    // The stock anchor is what `APP12-B01`'s availability port reads. A SKU with
    // no anchor is a real state too, and is exercised by the variants that get
    // no SKU at all rather than by omitting one here.
    await client.query(
      `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
       values ($1, $2, $3, 0)`,
      [randomUUID(), skuId, sku.onHand],
    );
  }
  return variantId;
}

async function insertProduct(client, { categoryId, slug, name, description, displayOrder }) {
  const productId = randomUUID();
  await client.query(
    // `is_display_out_of_stock` is set FALSE on both Products deliberately. It is
    // an operator display flag and not stock truth, and one of these Products has
    // nothing to sell — so the flag and the real availability disagree, and the
    // panel must follow `APP12-B01` rather than the flag (`APP12-S01` §19).
    `insert into products
       (id, category_id, slug, name, description, base_price_amount, currency_code,
        status, is_display_out_of_stock, is_indexable, display_order)
     values ($1, $2, $3, $4, $5, $6, 'VND', 'PUBLISHED', false, true, $7)`,
    [productId, categoryId, slug, name, description, S01_BASE_PRICE, displayOrder],
  );
  return productId;
}

/**
 * Writes the fixture and returns the identifiers the spec asserts against.
 *
 * @param {{ databaseUrl: string, log?: (msg: string) => void }} params
 */
export async function seedS01Catalog({ databaseUrl, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('begin');

    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, 900, 'PUBLISHED', true)`,
      [
        categoryId,
        'Đồ thử nghiệm S01',
        S01_CATEGORY_SLUG,
        'APP12-S01 disposable acceptance fixture. Never operator-authored catalog.',
      ],
    );

    const purchasableId = await insertProduct(client, {
      categoryId,
      slug: S01_PURCHASABLE_SLUG,
      name: 'Áo thun thử nghiệm S01',
      description: 'Sản phẩm thử nghiệm cho quy trình mua hàng có sẵn.',
      displayOrder: 1,
    });

    // Order matters: the panel renders both axes in the order the server
    // publishes them, and the spec asserts that order rather than a sorted one.
    await insertVariant(client, {
      productId: purchasableId,
      colorName: 'Trắng',
      sizeLabel: 'M',
      displayOrder: 1,
      skus: [{ onHand: 8, priceOverride: S01_OVERRIDE_PRICE }],
    });
    await insertVariant(client, {
      productId: purchasableId,
      colorName: 'Trắng',
      sizeLabel: 'L',
      displayOrder: 2,
      skus: [{ onHand: 0 }],
    });
    await insertVariant(client, {
      productId: purchasableId,
      colorName: 'Đen',
      sizeLabel: 'M',
      displayOrder: 3,
      skus: [{ onHand: 3 }],
    });
    await insertVariant(client, {
      productId: purchasableId,
      colorName: 'Đen',
      sizeLabel: 'L',
      displayOrder: 4,
      skus: [],
    });
    // The state the Admin write side forbids and the read side must survive:
    // two order-eligible SKUs under one customer-visible variant, with no
    // published differentiator between them. Written directly precisely because
    // no application path will produce it.
    await insertVariant(client, {
      productId: purchasableId,
      colorName: 'Xanh rêu',
      sizeLabel: 'M',
      displayOrder: 5,
      skus: [{ onHand: 9, priceOverride: '100000' }, { onHand: 1 }],
    });

    const unbuyableId = await insertProduct(client, {
      categoryId,
      slug: S01_UNBUYABLE_SLUG,
      name: 'Khăn tay thử nghiệm S01',
      description: 'Sản phẩm công khai nhưng chưa có hàng để bán.',
      displayOrder: 2,
    });
    await insertVariant(client, {
      productId: unbuyableId,
      colorName: 'Trắng',
      sizeLabel: 'M',
      displayOrder: 1,
      skus: [],
    });

    await client.query('commit');
    log(`seeded APP12-S01 catalog fixture into ${databaseName}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  return {
    categorySlug: S01_CATEGORY_SLUG,
    purchasableSlug: S01_PURCHASABLE_SLUG,
    unbuyableSlug: S01_UNBUYABLE_SLUG,
  };
}
