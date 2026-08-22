/**
 * `APP7-B01` — the concurrency proof, on real connections.
 *
 * `skus.product_variant_id` carries no uniqueness constraint, so nothing in the
 * schema stops two Admin writes from each leaving a sellable SKU on one variant.
 * The guard is the owning `product_variants` row, locked `FOR UPDATE` before the
 * SKU set is read. This suite is what makes that claim checkable rather than
 * asserted: two independently pooled connections, two genuine PostgreSQL
 * backends, and a third that holds the row lock first so both writers are
 * guaranteed to reach their own `FOR UPDATE` before either can write.
 *
 * A single-connection `Promise.all` would prove nothing — one pool serialises
 * the two calls by itself, and the test would pass with no lock in the code.
 */
import { sql } from 'drizzle-orm';
import { DatabaseExecutor } from '@embroidery/persistence';

import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { ProductSkuService } from '../../application/product-sku.service';
import { isProductSkuError } from '../../domain/product-sku.errors';
import {
  activeSkuCount,
  asAdmin,
  counter,
  seedAdmin,
  seedVariant,
  skuCount,
  SKU_TEST_MODULES,
} from './sku-fixture';

describe('APP7-B01 concurrent SKU writes (integration)', () => {
  let context: ConcurrencyTestContext;
  let countOf: ReturnType<typeof counter>;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app7-b01-race', SKU_TEST_MODULES);
    countOf = counter(context.disposable.client.db);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  }, 240_000);

  async function seed(): Promise<{ adminId: string; productId: string; variantId: string }> {
    const db = context.disposable.client.db;
    const adminId = await seedAdmin(db, 'b01-race');
    return { adminId, ...(await seedVariant(db)) };
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
   * Runs two calls against the same variant with both writers parked on the
   * variant's row lock, then releases them together.
   */
  async function race(
    variantId: string,
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
        .execute(sql`select id from product_variants where id = ${variantId} for update`);
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

  function refusalCodeOf(results: PromiseSettledResult<unknown>[]): string {
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    // Whichever lost, it lost as a safe domain refusal: no SQLSTATE, no
    // constraint name and no driver message reached the caller.
    expect(isProductSkuError(failure)).toBe(true);
    return failure.code as string;
  }

  it('two concurrent creates cannot both leave an order-eligible SKU', async () => {
    await context.reset();
    const seeded = await seed();

    const results = await race(
      seeded.variantId,
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor.get<ProductSkuService>(ProductSkuService).create({
            productId: seeded.productId,
            variantId: seeded.variantId,
            code: 'TB-RACE-ONE',
            isActive: true,
          }),
        ),
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor.get<ProductSkuService>(ProductSkuService).create({
            productId: seeded.productId,
            variantId: seeded.variantId,
            code: 'TB-RACE-TWO',
            isActive: true,
          }),
        ),
    );

    // Exactly one committed, whichever way PostgreSQL ordered them — no
    // arbitrary winner is chosen by the application and neither call retried.
    expect(refusalCodeOf(results)).toBe('SKU_ORDER_ELIGIBLE_AMBIGUOUS');

    // The invariant, read from the database rather than from a return value.
    expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
    // The loser left nothing behind — not even the row it tried to insert.
    expect(await countOf(skuCount(seeded.variantId))).toBe(1);
    expect(
      await countOf(sql`select count(*)::text as count from audit_events
                         where action = 'product.sku_created'`),
    ).toBe(1);
  }, 120_000);

  it('two concurrent activations of two inactive SKUs cannot both win', async () => {
    await context.reset();
    const seeded = await seed();
    const admin = await context.spawnActor('seeder');

    const [alpha, beta] = await asAdmin(admin, seeded.adminId, async () => {
      const service = admin.get<ProductSkuService>(ProductSkuService);
      const a = await service.create({
        productId: seeded.productId,
        variantId: seeded.variantId,
        code: 'TB-SPARE-A',
        isActive: false,
      });
      const b = await service.create({
        productId: seeded.productId,
        variantId: seeded.variantId,
        code: 'TB-SPARE-B',
        isActive: false,
      });
      return [a, b] as const;
    });
    await admin.close();

    const results = await race(
      seeded.variantId,
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor
            .get<ProductSkuService>(ProductSkuService)
            .update({ skuId: alpha.skuId, fields: { isActive: true } }),
        ),
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor
            .get<ProductSkuService>(ProductSkuService)
            .update({ skuId: beta.skuId, fields: { isActive: true } }),
        ),
    );

    expect(refusalCodeOf(results)).toBe('SKU_ORDER_ELIGIBLE_AMBIGUOUS');
    expect(await countOf(activeSkuCount(seeded.variantId))).toBe(1);
  }, 120_000);

  it('the duplicate code is refused by the database, not by a preflight read', async () => {
    await context.reset();
    const seeded = await seed();

    // Both writers ask for the *same* code on the same variant, one sellable and
    // one not. A check-then-write would let both pass their own read; only
    // `CST-012` can decide this, and it decides it once.
    const results = await race(
      seeded.variantId,
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor.get<ProductSkuService>(ProductSkuService).create({
            productId: seeded.productId,
            variantId: seeded.variantId,
            code: 'TB-SAME-CODE',
            isActive: true,
          }),
        ),
      (actor) =>
        asAdmin(actor, seeded.adminId, () =>
          actor.get<ProductSkuService>(ProductSkuService).create({
            productId: seeded.productId,
            variantId: seeded.variantId,
            code: 'TB-SAME-CODE',
            isActive: false,
          }),
        ),
    );

    // Either arbiter may fire first depending on which writer PostgreSQL let
    // through; both are safe refusals and both leave one row.
    expect(['SKU_CODE_CONFLICT', 'SKU_ORDER_ELIGIBLE_AMBIGUOUS']).toContain(refusalCodeOf(results));
    expect(
      await countOf(sql`select count(*)::text as count from skus where code = 'TB-SAME-CODE'`),
    ).toBe(1);
  }, 120_000);
});
