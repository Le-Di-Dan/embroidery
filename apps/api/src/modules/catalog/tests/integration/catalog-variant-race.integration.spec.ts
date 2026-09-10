/**
 * `APP12-N02.B01` — the concurrency proof, on real connections.
 *
 * `product_variants` carries no unique constraint on
 * `(product_id, color_name, size_label)` and `display_order` is `NOT NULL` with
 * no `DEFAULT`, so nothing in the schema stops two Admin writes from creating
 * the same variant twice or from both claiming the same order. The guard is the
 * owning `products` row, locked `FOR UPDATE` before the variant set is read.
 *
 * This suite is what makes that claim checkable rather than asserted: two
 * independently pooled connections, two genuine PostgreSQL backends, and a
 * third that holds the row lock first so both writers are guaranteed to reach
 * their own `FOR UPDATE` before either can write. A single-connection
 * `Promise.all` would prove nothing — one pool serialises the two calls by
 * itself, and the test would pass with no lock in the code.
 */
import { sql } from 'drizzle-orm';
import { DatabaseExecutor } from '@embroidery/persistence';

import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { ProductVariantService } from '../../application/product-variant.service';
import { isProductVariantError } from '../../domain/product-variant.errors';
import {
  asAdmin,
  counter,
  seedAdmin,
  seedProduct,
  variantCount,
  VARIANT_TEST_MODULES,
} from './variant-fixture';

describe('APP12-N02.B01 concurrent variant writes (integration)', () => {
  let context: ConcurrencyTestContext;
  let countOf: ReturnType<typeof counter>;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app12-n02-b01-race', VARIANT_TEST_MODULES);
    countOf = counter(context.disposable.client.db);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  }, 240_000);

  async function seed(): Promise<{ adminId: string; productId: string }> {
    const db = context.disposable.client.db;
    const adminId = await seedAdmin(db, 'n02-b01-race');
    return { adminId, productId: await seedProduct(db, 'DRAFT') };
  }

  /** Waits for a real condition: `count` backends blocked on a lock. */
  async function waitForBlockedBackends(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const blocked = await countOf(
        sql`select count(*)::text as count from pg_locks where not granted`,
      );
      if (blocked >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${count} blocked backends.`);
  }

  /**
   * Runs two calls against the same product with both writers parked on the
   * product's row lock, then releases them together.
   */
  async function race(
    productId: string,
    first: (actor: ConcurrencyActor) => Promise<unknown>,
    second: (actor: ConcurrencyActor) => Promise<unknown>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const holder = await context.spawnActor('holder');
    const one = await context.spawnActor('writer-one');
    const two = await context.spawnActor('writer-two');

    let releaseHolder: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const holding = holder.inTransaction(async () => {
      await holder
        .get<DatabaseExecutor>(DatabaseExecutor)
        .current()
        .execute(sql`select id from products where id = ${productId} for update`);
      locked();
      await held;
    });
    await lockTaken;

    const attempts = Promise.allSettled([first(one), second(two)]);
    await waitForBlockedBackends(2);
    releaseHolder();
    await holding;

    const results = await attempts;
    await Promise.all([holder.close(), one.close(), two.close()]);
    return results;
  }

  it('two concurrent creates of the same identity leave exactly one variant', async () => {
    await context.reset();
    const { adminId, productId } = await seed();

    const create = (actor: ConcurrencyActor) =>
      asAdmin(actor, adminId, () =>
        actor
          .get<ProductVariantService>(ProductVariantService)
          .create({ productId, colorName: 'Xanh navy', sizeLabel: 'M', isActive: true }),
      );

    const results = await race(productId, create, create);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);

    // Whichever lost, it lost as a safe domain refusal: no SQLSTATE, no
    // constraint name and no driver message reached the caller — and there is
    // no constraint to have raised one, which is the point.
    const failure = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect(isProductVariantError(failure)).toBe(true);
    expect(failure.code).toBe('PRODUCT_VARIANT_DUPLICATE');

    expect(await countOf(variantCount(productId))).toBe(1);
  }, 120_000);

  it('two concurrent creates of different identities settle two distinct display orders', async () => {
    await context.reset();
    const { adminId, productId } = await seed();

    const creating = (color: string) => (actor: ConcurrencyActor) =>
      asAdmin(actor, adminId, () =>
        actor
          .get<ProductVariantService>(ProductVariantService)
          .create({ productId, colorName: color, sizeLabel: 'M', isActive: true }),
      );

    const results = await race(productId, creating('Xanh navy'), creating('Đen'));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(await countOf(variantCount(productId))).toBe(2);

    // The assignment is the thing under test: two writers that each read the
    // set before the other committed would both have computed 0.
    const rows = await context.disposable.client.db.execute<{ display_order: number }>(
      sql`select display_order from product_variants where product_id = ${productId}
           order by display_order`,
    );
    expect(rows.rows.map((row) => Number(row.display_order))).toEqual([0, 1]);
  }, 120_000);

  it('a create and a colliding rename cannot both win', async () => {
    await context.reset();
    const { adminId, productId } = await seed();

    // One variant to rename, seeded through the service so its order is the
    // one the server assigns.
    const setup = await context.spawnActor('setup');
    const existing = await asAdmin(setup, adminId, () =>
      setup
        .get<ProductVariantService>(ProductVariantService)
        .create({ productId, colorName: 'Trắng', sizeLabel: 'M', isActive: true }),
    );
    await setup.close();

    const results = await race(
      productId,
      (actor) =>
        asAdmin(actor, adminId, () =>
          actor
            .get<ProductVariantService>(ProductVariantService)
            .create({ productId, colorName: 'Đen', sizeLabel: 'M', isActive: true }),
        ),
      (actor) =>
        asAdmin(actor, adminId, () =>
          actor.get<ProductVariantService>(ProductVariantService).update({
            productId,
            variantId: existing.variantId,
            fields: { colorName: 'đen' },
          }),
        ),
    );

    // Order is not fixed — either may reach the lock first — but they cannot
    // both succeed, and the loser is a domain refusal rather than a constraint
    // violation, because there is no constraint.
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect(isProductVariantError(failure)).toBe(true);
    expect(failure.code).toBe('PRODUCT_VARIANT_DUPLICATE');
  }, 120_000);
});
