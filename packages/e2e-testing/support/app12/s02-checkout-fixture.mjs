/**
 * The `APP12-S02` Ready-Made checkout fixture and its commercial evidence
 * reader.
 *
 * ## Where this may run, and where it may never run
 *
 * Only against the **disposable** database `startEnvironment` provisions and
 * drops. `APP12-S02` §43 and §44 are unusually strict about it, and rightly:
 * S02 is the first Storefront checkpoint that creates **immutable commercial
 * history**. An order, its frozen line, its stock reservation, its idempotency
 * record and its `ORDER_ACCESS` grant are not rows a harness can tidy up
 * afterwards — `order_items` in particular is undeletable by design
 * (`APP12-B02`) — so the only cleanup that cannot leave something behind is
 * dropping the whole database, which is what the run does.
 *
 * `assertDisposable` refuses to run against anything else, so that is enforced
 * rather than remembered. The shared development database receives nothing:
 * zero orders, zero reservations, zero grants, zero idempotency records.
 *
 * ## Why it writes catalog SQL rather than driving the Admin API
 *
 * The same reason `s01-catalog-fixture.mjs` records: composing this catalog
 * through the Admin surfaces would exercise APP2, APP7 and APP8 write paths
 * whose failure would look like an S02 defect and would not be one. The rows are
 * written directly, in the shapes the delivered schema declares.
 *
 * **Nothing S02 is meant to prove is seeded.** The Customer, the verification
 * challenge, the order, its line, its shipping detail, its reservation, its
 * idempotency record and its grant are all produced by the application itself,
 * through the real API, from a real browser.
 *
 * ## The dataset
 *
 * ```text
 * app12-s02-e2e-ao-thun    Trắng · M   one SKU, 60 available, override 399000
 *                          Trắng · L   one SKU, 1 available   → the stock-race subject
 *                          Xanh rêu·M  TWO eligible SKUs      → ambiguous, fail-closed
 * ```
 *
 * `Trắng · L` carries exactly one unit on purpose: it is what lets the run prove
 * the "stock changed while the customer was on the page" refusal against real
 * inventory rather than against a mock.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

const { Client } = pg;

/** The prefix every business key in this fixture carries. */
export const S02_FIXTURE_PREFIX = 'app12-s02-e2e';

export const S02_CATEGORY_SLUG = `${S02_FIXTURE_PREFIX}-do-thu-nghiem`;
export const S02_PRODUCT_SLUG = `${S02_FIXTURE_PREFIX}-ao-thun`;

/** The base price the Product publishes, before any SKU override. */
export const S02_BASE_PRICE = '450000';
/** The override on `Trắng · M`, deliberately different from the base price. */
export const S02_OVERRIDE_PRICE = '399000';
/**
 * Units behind `Trắng · M`.
 *
 * Sized for the **whole suite**, not for one journey: the run places a real
 * order in each of the three viewport journeys and several more in the
 * idempotency and accessibility cases, and every one of them reserves units that
 * are never released inside the run. An under-provisioned SKU makes a later case
 * fail with "nothing to buy" — a true statement about the fixture and a
 * misleading one about the code.
 */
export const S02_MAIN_STOCK = 60;

/**
 * Refuses to touch anything but a disposable database.
 *
 * `createDisposableDatabase` names every database it makes `embroidery_db7_*`,
 * and the persistent development database is plain `embroidery`. Checking the
 * name is what keeps a mistyped `E2E_POSTGRES_PORT` from pointing this at the
 * shared stack — the failure mode this guard exists for, because an order
 * written there could not be removed afterwards.
 */
function assertDisposable(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.startsWith('embroidery_db7_')) {
    throw new Error(
      `Refusing to seed the APP12-S02 fixture into "${name}": only a disposable database ` +
        '(embroidery_db7_*) may receive it. See VALIDATION_GOVERNANCE.md §3A.4 and ' +
        'APP12-S02 §43.',
    );
  }
  return name;
}

async function insertVariant(client, { productId, colorName, sizeLabel, displayOrder, skus }) {
  const variantId = randomUUID();
  await client.query(
    `insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
     values ($1, $2, $3, $4, $5, true)`,
    [variantId, productId, colorName, sizeLabel, displayOrder],
  );

  const created = [];
  for (const [index, sku] of skus.entries()) {
    const skuId = randomUUID();
    await client.query(
      `insert into skus (id, product_variant_id, code, price_override_amount, currency_code, is_active)
       values ($1, $2, $3, $4, 'VND', true)`,
      [
        skuId,
        variantId,
        `${S02_FIXTURE_PREFIX}-${String(colorName ?? 'x')}-${String(sizeLabel ?? 'x')}-${String(index)}`,
        sku.priceOverride ?? null,
      ],
    );
    // The stock anchor `APP12-B01`'s availability port reads and `APP12-B02`
    // locks. A SKU with no anchor is refused as INSUFFICIENT_STOCK by design;
    // every SKU here has one, because the refusals this run proves are about
    // quantity rather than about missing inventory data.
    await client.query(
      `insert into sku_stocks (id, sku_id, quantity_on_hand, low_stock_threshold)
       values ($1, $2, $3, 0)`,
      [randomUUID(), skuId, sku.onHand],
    );
    created.push(skuId);
  }
  return { variantId, skuIds: created };
}

/**
 * Writes the fixture and returns the identifiers the spec asserts against.
 *
 * @param {{ databaseUrl: string, log?: (msg: string) => void }} params
 */
export async function seedS02Catalog({ databaseUrl, log = () => {} }) {
  const databaseName = assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('begin');

    const categoryId = randomUUID();
    await client.query(
      `insert into categories (id, name, slug, description, display_order, status, is_indexable)
       values ($1, $2, $3, $4, 910, 'PUBLISHED', true)`,
      [
        categoryId,
        'Đồ thử nghiệm S02',
        S02_CATEGORY_SLUG,
        'APP12-S02 disposable acceptance fixture. Never operator-authored catalog.',
      ],
    );

    const productId = randomUUID();
    await client.query(
      // `is_display_out_of_stock` is FALSE deliberately: it is an operator
      // display flag and not stock truth, and the checkout must follow
      // `APP12-B01`'s availability rather than the flag.
      `insert into products
         (id, category_id, slug, name, description, base_price_amount, currency_code,
          status, is_display_out_of_stock, is_indexable, display_order)
       values ($1, $2, $3, $4, $5, $6, 'VND', 'PUBLISHED', false, true, 1)`,
      [
        productId,
        categoryId,
        S02_PRODUCT_SLUG,
        'Áo thun thử nghiệm S02',
        'Sản phẩm thử nghiệm cho quy trình đặt hàng có sẵn.',
        S02_BASE_PRICE,
      ],
    );

    const main = await insertVariant(client, {
      productId,
      colorName: 'Trắng',
      sizeLabel: 'M',
      displayOrder: 1,
      skus: [{ onHand: S02_MAIN_STOCK, priceOverride: S02_OVERRIDE_PRICE }],
    });
    const scarce = await insertVariant(client, {
      productId,
      colorName: 'Trắng',
      sizeLabel: 'L',
      displayOrder: 2,
      skus: [{ onHand: 1 }],
    });
    // The state the Admin write side forbids and the read side must survive.
    // Written directly precisely because no application path will produce it.
    const ambiguous = await insertVariant(client, {
      productId,
      colorName: 'Xanh rêu',
      sizeLabel: 'M',
      displayOrder: 3,
      skus: [{ onHand: 9, priceOverride: '100000' }, { onHand: 1 }],
    });

    await client.query('commit');
    log(`seeded APP12-S02 catalog fixture into ${databaseName}`);

    return {
      categorySlug: S02_CATEGORY_SLUG,
      productSlug: S02_PRODUCT_SLUG,
      mainSkuId: main.skuIds[0],
      scarceSkuId: scarce.skuIds[0],
      ambiguousSkuIds: ambiguous.skuIds,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Reads the commercial rows the run creates — counts and safe columns only.
 *
 * ## What it never returns
 *
 * The `ORDER_ACCESS` token. `secure_access_grants` stores a **hash** and never
 * the plaintext, so there is nothing here to leak even by accident; the reader
 * additionally selects no `*_hash`, `*_digest` or `token` column, so no digest
 * reaches an assertion, a log line or a Playwright attachment either
 * (`APP12-S02` §48). The evidence a grant exists is its **count** and its scope,
 * which is exactly what §48 asks for and no more.
 *
 * Contact values are likewise never selected: the run asserts *how many*
 * customers and notifications exist, never who they are.
 */
export async function createS02Evidence(databaseUrl) {
  assertDisposable(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const count = async (text, values = []) =>
    Number((await client.query(text, values)).rows[0]?.count ?? 0);

  return {
    close: () => client.end(),

    /** Every READY_MADE order this database holds. */
    countReadyMadeOrders: () =>
      count(`select count(*)::int as count from orders where origin = 'READY_MADE'`),

    /** Order codes and states — quotable facts, no ids and no amounts of ours. */
    readReadyMadeOrders: async () => {
      const result = await client.query(
        `select code, status, origin from orders where origin = 'READY_MADE' order by created_at asc`,
      );
      return result.rows;
    },

    /** Stock reservations standing against this run's READY_MADE orders. */
    countReservations: () =>
      count(
        `select count(*)::int as count from inventory_reservations r
         join orders o on o.id = r.order_id
         where o.origin = 'READY_MADE'`,
      ),

    /**
     * Live `ORDER_ACCESS` grants. Counted and scoped; never read.
     *
     * `status = 'ACTIVE'` rather than `revoked_at is null`: the schema carries
     * both, and the status column is the lifecycle authority — an expired grant
     * has no `revoked_at` either, and counting it as live would let a lapsed
     * link pass for a delivered one. `token_hash` is not selected, so not even
     * the digest leaves this function.
     */
    countOrderAccessGrants: () =>
      count(
        `select count(*)::int as count from secure_access_grants
         where scope_kind = 'ORDER_ACCESS' and status = 'ACTIVE'`,
      ),

    /**
     * Notification intents raised for this run.
     *
     * The intent is the durable record `APP4-B01` writes; the delivery attempts
     * beside it belong to the worker, which this topology holds closed. Counting
     * intents is therefore what proves "a message was raised for the customer",
     * which is exactly the §48 claim — and `recipient_masked` is not selected,
     * so no contact, masked or otherwise, reaches an assertion.
     */
    countNotificationIntents: () =>
      count(`select count(*)::int as count from notification_intents`),

    /**
     * Idempotency records in `APP12-B02`'s own namespace.
     *
     * `readyMadeOrder.create` scopes by `challengeId`, and the table's
     * `uq_idempotency_records__namespace_scope_key` is the arbiter — so this
     * count *is* the number of distinct verified contacts that have placed an
     * order, and a second submission on the same challenge cannot add to it.
     * That is what makes the double-submit proof structural rather than a matter
     * of counting requests the browser happened to send.
     */
    countIdempotencyRecords: () =>
      count(
        `select count(*)::int as count from idempotency_records
         where operation_namespace = 'readyMadeOrder.create'`,
      ),

    /** The same records' statuses, so a stuck IN_PROGRESS claim is visible. */
    readIdempotencyStatuses: async () => {
      const result = await client.query(
        `select status from idempotency_records
         where operation_namespace = 'readyMadeOrder.create' order by created_at asc`,
      );
      return result.rows.map((row) => row.status);
    },

    /**
     * The stock anchor's raw on-hand figure.
     *
     * **Not** availability, and the distinction is the whole point: creating an
     * order does not decrement `quantity_on_hand`. It writes a `RESERVED`
     * inventory reservation against the anchor, and the units are only consumed
     * at fulfilment. A run that asserted on-hand had dropped would be asserting
     * a behaviour the domain deliberately does not have.
     */
    readOnHandQuantity: async (skuId) => {
      const result = await client.query(
        `select quantity_on_hand from sku_stocks where sku_id = $1`,
        [skuId],
      );
      return Number(result.rows[0]?.quantity_on_hand ?? 0);
    },

    /**
     * What `APP12-B01` would publish as available: on-hand, less active holds,
     * less active reservations (`BR-022`), never negative.
     *
     * Computed here the way the domain computes it rather than read from one
     * column, so "the order actually reserved the units" is provable against the
     * same figure the customer was shown.
     */
    readAvailableQuantity: async (skuId) => {
      const result = await client.query(
        `select greatest(0,
                  s.quantity_on_hand
                  - coalesce((select sum(h.quantity) from inventory_soft_holds h
                               where h.sku_stock_id = s.id and h.status = 'HELD'), 0)
                  - coalesce((select sum(r.quantity) from inventory_reservations r
                               where r.sku_stock_id = s.id and r.status = 'RESERVED'), 0)
                )::int as available
           from sku_stocks s where s.sku_id = $1`,
        [skuId],
      );
      return Number(result.rows[0]?.available ?? 0);
    },

    /**
     * Takes units off a SKU outside the browser, to race the customer.
     *
     * On-hand rather than a reservation, deliberately: this stands in for stock
     * leaving by any route — another order, an operator correction, a
     * stocktake — and it is the anchor `APP12-B02` locks and re-checks, so the
     * refusal it produces is the real one.
     */
    consumeStock: async (skuId, units) => {
      await client.query(
        `update sku_stocks set quantity_on_hand = greatest(0, quantity_on_hand - $2)
         where sku_id = $1`,
        [skuId, units],
      );
    },
  };
}
