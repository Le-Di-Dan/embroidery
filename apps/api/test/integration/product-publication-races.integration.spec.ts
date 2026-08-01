/**
 * `APP2-B03` publication races, against real concurrent PostgreSQL connections.
 *
 * Each actor is a separately compiled module with its **own** connection pool,
 * so two publish attempts genuinely run on different PostgreSQL backends and
 * can block on each other for real. `Promise.all` over one pool would prove
 * nothing: the statements would simply queue.
 *
 * The property under test is not "the second call fails" — it is that exactly
 * one transition, one audit row and one outbox event exist afterwards. A design
 * that let both callers win would still pass a test that only checked errors.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';
import { DatabaseExecutor } from '@embroidery/persistence';

import { AuditContextModule } from '../../src/platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../src/platform/request-context/request-context.module';
import { RequestContextService } from '../../src/platform/request-context/request-context.service';
import { CatalogDraftModule } from '../../src/modules/catalog/catalog-draft.module';
import { CatalogPublicationModule } from '../../src/modules/catalog/catalog-publication.module';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../src/tests/integration/db8-concurrency-context';

const MODULES = [
  RequestContextModule,
  AuditContextModule,
  CatalogDraftModule,
  CatalogPublicationModule,
];

describe('product publication races (live PostgreSQL, independent connections)', () => {
  let ctx: ConcurrencyTestContext;
  let alice: ConcurrencyActor;
  let bob: ConcurrencyActor;
  let adminId: string;
  let seedCounter = 0;

  beforeAll(async () => {
    ctx = await createConcurrencyTestContext('app2b03-races', MODULES);
    alice = await ctx.spawnActor('alice');
    bob = await ctx.spawnActor('bob');

    adminId = newId();
    await ctx.disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, 'races@example.test', 'Quản trị viên', 'ACTIVE')
    `);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  /** Runs `work` as an Admin on that actor's own request-context instance. */
  async function asAdmin<T>(actor: ConcurrencyActor, work: () => Promise<T>): Promise<T> {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    return requestContext.run({ requestId: `race-${newId()}` }, async () => {
      requestContext.bindActor({ kind: 'ADMIN', adminId });
      return work();
    });
  }

  async function seedAsset(): Promise<string> {
    const id = newId();
    await ctx.disposable.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE',
              ${`development/originals/${id}/original.png`}, 'image/png', 51200,
              ${`sha256:${'e'.repeat(64)}`}, 'ACCEPTED')
    `);
    for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
      await ctx.disposable.client.db.execute(sql`
        insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
        values (${newId()}, ${id}, ${kind}, 'READY',
                ${`development/derivatives/${id}/${kind}.webp`}, false)
      `);
    }
    return id;
  }

  /** A publishable DRAFT, created through the real draft seam. */
  async function seedPublishable(): Promise<{ productId: string; updatedAt: string }> {
    const drafts = alice.get<ProductDraftService>(ProductDraftService);
    seedCounter += 1;
    const created = await drafts.create({
      categorySlug: 'thu-bong',
      name: `Sản phẩm đua ${seedCounter}-${newId().slice(-6)}`,
      description: 'Mô tả đầy đủ để có thể xuất bản.',
    });
    const updated = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      basePriceAmount: '250000',
      mediaAssetIds: [await seedAsset()],
    });
    return { productId: updated.productId, updatedAt: updated.updatedAt };
  }

  function outcomeOf(result: PromiseSettledResult<unknown>): string {
    return result.status === 'fulfilled'
      ? 'OK'
      : ((result.reason as { code?: string }).code ?? 'NO_CODE');
  }

  async function evidence(productId: string) {
    const [product] = await alice.snapshot<{ status: string }>(
      sql`select status from products where id = ${productId}`,
    );
    const audits = await alice.snapshot<{ action: string }>(
      sql`select action from audit_events
          where target_kind = 'PRODUCT' and target_id = ${productId} order by id`,
    );
    const events = await alice.snapshot<{ event_type: string }>(
      sql`select event_type from outbox_events
          where aggregate_kind = 'PRODUCT' and aggregate_id = ${productId} order by id`,
    );
    return { status: product?.status, audits, events };
  }

  it('lets exactly one of two concurrent publishes win', async () => {
    const seeded = await seedPublishable();
    const expectedUpdatedAt = new Date(seeded.updatedAt);

    // Both start before either can finish; the exclusive lock the first one
    // takes on the product root is what serialises them.
    const results = await Promise.allSettled([
      asAdmin(alice, () =>
        alice
          .get<ProductPublicationService>(ProductPublicationService)
          .publish({ productId: seeded.productId, expectedUpdatedAt }),
      ),
      asAdmin(bob, () =>
        bob
          .get<ProductPublicationService>(ProductPublicationService)
          .publish({ productId: seeded.productId, expectedUpdatedAt }),
      ),
    ]);

    const outcomes = results.map(outcomeOf).sort();
    expect(outcomes).toEqual(['OK', 'PRODUCT_VERSION_CONFLICT']);

    const { status, audits, events } = await evidence(seeded.productId);
    expect(status).toBe('PUBLISHED');
    expect(audits.map((row) => row.action)).toEqual(['product.published']);
    expect(events.map((row) => row.event_type)).toEqual(['product.published']);
  });

  it('lets exactly one of two concurrent unpublishes win', async () => {
    const seeded = await seedPublishable();
    const published = await asAdmin(alice, () =>
      alice
        .get<ProductPublicationService>(ProductPublicationService)
        .publish({ productId: seeded.productId, expectedUpdatedAt: new Date(seeded.updatedAt) }),
    );
    const expectedUpdatedAt = new Date(published.updatedAt);

    const results = await Promise.allSettled([
      asAdmin(alice, () =>
        alice
          .get<ProductPublicationService>(ProductPublicationService)
          .unpublish({ productId: seeded.productId, expectedUpdatedAt }),
      ),
      asAdmin(bob, () =>
        bob
          .get<ProductPublicationService>(ProductPublicationService)
          .unpublish({ productId: seeded.productId, expectedUpdatedAt }),
      ),
    ]);

    expect(results.map(outcomeOf).sort()).toEqual(['OK', 'PRODUCT_VERSION_CONFLICT']);

    const { status, audits, events } = await evidence(seeded.productId);
    expect(status).toBe('DRAFT');
    expect(audits.map((row) => row.action)).toEqual(['product.published', 'product.unpublished']);
    expect(events.map((row) => row.event_type)).toEqual([
      'product.published',
      'product.unpublished',
    ]);
  });

  it('does not let a concurrent asset rejection slip past the readiness recheck', async () => {
    const seeded = await seedPublishable();
    const [link] = await alice.snapshot<{ asset_id: string }>(
      sql`select asset_id from product_media where product_id = ${seeded.productId}`,
    );
    const assetId = link?.asset_id ?? '';

    // Bob rejects the asset inside a transaction he has not committed, so he
    // holds the row's write lock. Alice's publish takes `FOR SHARE` on the same
    // row, so she cannot read past him — the interleaving is enforced by
    // PostgreSQL, not by the timing below.
    let publish!: Promise<string>;
    await bob.inTransaction(async () => {
      const executor = bob.get<DatabaseExecutor>(DatabaseExecutor);
      await executor
        .current()
        .execute(sql`update assets set status = 'REJECTED' where id = ${assetId}`);

      publish = asAdmin(alice, () =>
        alice.get<ProductPublicationService>(ProductPublicationService).publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      )
        .then(() => 'OK')
        .catch((error: unknown) => (error as { code?: string }).code ?? 'NO_CODE');

      // Let Alice reach the lock. The assertion that follows is the real proof
      // and does not depend on this delay: whatever Alice has managed to do by
      // now, she cannot have published, because Bob still holds the lock.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const [mid] = await alice.snapshot<{ status: string }>(
        sql`select status from products where id = ${seeded.productId}`,
      );
      expect(mid?.status).toBe('DRAFT');
    });

    // Bob has committed the rejection. Alice unblocks, re-reads the asset under
    // her own lock, and must now see the rejected state — not the accepted one
    // she would have seen without the lock.
    expect(await publish).toBe('PRODUCT_PUBLICATION_NOT_READY');
    const { status, audits, events } = await evidence(seeded.productId);
    expect(status).toBe('DRAFT');
    expect(audits).toEqual([]);
    expect(events).toEqual([]);
  });
});
