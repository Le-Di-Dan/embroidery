/**
 * `APP12-C02` archive races, against real concurrent PostgreSQL connections.
 *
 * Each actor is a separately compiled module with its **own** connection pool,
 * so the two transactions genuinely run on different PostgreSQL backends and can
 * block on each other for real. `Promise.all` over one pool would prove nothing:
 * the statements would simply queue on a single connection.
 *
 * ## The invariant
 *
 * ```text
 * NEVER: category = ARCHIVED  AND  a Product = PUBLISHED under that category
 * ```
 *
 * It holds because the two paths take incompatible locks on the **same** row:
 * `AdminCategoryRepository.lockById` takes `FOR UPDATE` before the archive
 * counts dependencies, and the Product publication path already took `FOR SHARE`
 * on the owning category inside its own transaction
 * (`DrizzleProductPublicationRepository.lockSnapshot`). Whichever transaction
 * arrives second waits for the first to commit and then re-reads committed
 * truth:
 *
 * - archive first → the publish sees an `ARCHIVED` category and fails readiness;
 * - publish first → the archive counts the newly published product and refuses.
 *
 * The property under test is therefore **not** "one call fails". It is that the
 * *committed* state is never the forbidden pair — a design that let both win
 * would still pass a test that only checked for an error.
 *
 * The same argument covers category **reassignment**: `CategoryResolver`
 * resolves a write-path slug through `CategoryRepository.lockBySlug`, which is
 * the same `FOR SHARE` lock.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { AuditContextModule } from '../../src/platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../src/platform/request-context/request-context.module';
import { RequestContextService } from '../../src/platform/request-context/request-context.service';
import { CatalogAdminCategoryModule } from '../../src/modules/catalog/catalog-admin-category.module';
import { CatalogDraftModule } from '../../src/modules/catalog/catalog-draft.module';
import { CatalogPublicationModule } from '../../src/modules/catalog/catalog-publication.module';
import { AdminCategoryService } from '../../src/modules/catalog/application/admin-category.service';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import {
  createConcurrencyTestContext,
  type ConcurrencyActor,
  type ConcurrencyTestContext,
} from '../../src/tests/integration/db8-concurrency-context';

jest.setTimeout(300_000);

const MODULES = [
  RequestContextModule,
  AuditContextModule,
  CatalogDraftModule,
  CatalogPublicationModule,
  CatalogAdminCategoryModule,
];

describe('category archive races (live PostgreSQL, independent connections)', () => {
  let ctx: ConcurrencyTestContext;
  let alice: ConcurrencyActor;
  let bob: ConcurrencyActor;
  let adminId: string;
  let seedCounter = 0;

  beforeAll(async () => {
    ctx = await createConcurrencyTestContext('app12c02-archive-races', MODULES);
    alice = await ctx.spawnActor('alice');
    bob = await ctx.spawnActor('bob');

    adminId = newId();
    await ctx.disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, 'category-races@example.test', 'Quản trị viên', 'ACTIVE')
    `);
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

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

  /** A published category through the real seam, plus a publishable DRAFT in it. */
  async function seedScenario(slug: string) {
    seedCounter += 1;
    const categories = alice.get<AdminCategoryService>(AdminCategoryService);
    const draftCategory = await asAdmin(alice, () =>
      categories.create({
        slug,
        name: `Danh mục đua ${seedCounter}`,
        isIndexable: true,
        displayOrder: 100 + seedCounter,
      }),
    );
    const category = await asAdmin(alice, () =>
      categories.transition({
        categoryId: draftCategory.id,
        expectedUpdatedAt: new Date(draftCategory.updatedAt),
        action: 'PUBLISH',
      }),
    );

    const drafts = alice.get<ProductDraftService>(ProductDraftService);
    const created = await drafts.create({
      categorySlug: slug,
      name: `Sản phẩm đua ${seedCounter}-${newId().slice(-6)}`,
      description: 'Mô tả đầy đủ để có thể xuất bản.',
    });
    const product = await drafts.update({
      productId: created.productId,
      expectedUpdatedAt: new Date(created.updatedAt),
      basePriceAmount: '250000',
      mediaAssetIds: [await seedAsset()],
    });

    return { category, product };
  }

  function outcomeOf(result: PromiseSettledResult<unknown>): string {
    return result.status === 'fulfilled'
      ? 'OK'
      : ((result.reason as { code?: string }).code ?? 'NO_CODE');
  }

  /** The committed truth, read outside either actor's transaction. */
  async function committed(categoryId: string, productId: string) {
    const [category] = await alice.snapshot<{ status: string; archived_at: Date | null }>(
      sql`select status, archived_at from categories where id = ${categoryId}`,
    );
    const [product] = await alice.snapshot<{ status: string; category_id: string }>(
      sql`select status, category_id from products where id = ${productId}`,
    );
    return { category, product };
  }

  it('never commits an archived category with a product published under it', async () => {
    const { category, product } = await seedScenario('vay-theu-dua');

    // Both start before either can finish. The exclusive lock the archive takes
    // on the category row and the share lock the publish takes on the same row
    // are what serialise them.
    const results = await Promise.allSettled([
      asAdmin(alice, () =>
        alice.get<AdminCategoryService>(AdminCategoryService).transition({
          categoryId: category.id,
          expectedUpdatedAt: new Date(category.updatedAt),
          action: 'ARCHIVE',
        }),
      ),
      asAdmin(bob, () =>
        bob.get<ProductPublicationService>(ProductPublicationService).publish({
          productId: product.productId,
          expectedUpdatedAt: new Date(product.updatedAt),
        }),
      ),
    ]);

    const state = await committed(category.id, product.productId);
    const forbidden =
      state.category?.status === 'ARCHIVED' && state.product?.status === 'PUBLISHED';

    expect({
      forbidden,
      outcomes: results.map(outcomeOf),
      category: state.category?.status,
      product: state.product?.status,
    }).toMatchObject({ forbidden: false });

    // At least one of the two was refused — they cannot both have won.
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    // The product never moved category, whichever way the race went.
    expect(state.product?.category_id).toBe(category.id);
    // An archive that lost leaves `archived_at` unwritten; one that won stamps it.
    expect(state.category?.status === 'ARCHIVED').toBe(state.category?.archived_at !== null);
  });

  /**
   * The same race in the other direction, run several times so a scheduling
   * accident cannot be mistaken for a guarantee. Each round uses a fresh
   * category and product, and the invariant is checked on committed rows.
   */
  it('holds the invariant across repeated races in both orders', async () => {
    for (let round = 0; round < 3; round += 1) {
      const { category, product } = await seedScenario(`ao-khoac-dua-${round}`);

      const publishFirst = round % 2 === 0;
      const archiveWork = () =>
        asAdmin(alice, () =>
          alice.get<AdminCategoryService>(AdminCategoryService).transition({
            categoryId: category.id,
            expectedUpdatedAt: new Date(category.updatedAt),
            action: 'ARCHIVE',
          }),
        );
      const publishWork = () =>
        asAdmin(bob, () =>
          bob.get<ProductPublicationService>(ProductPublicationService).publish({
            productId: product.productId,
            expectedUpdatedAt: new Date(product.updatedAt),
          }),
        );

      const results = await Promise.allSettled(
        publishFirst ? [publishWork(), archiveWork()] : [archiveWork(), publishWork()],
      );

      const state = await committed(category.id, product.productId);
      expect({
        round,
        forbidden: state.category?.status === 'ARCHIVED' && state.product?.status === 'PUBLISHED',
        outcomes: results.map(outcomeOf),
      }).toMatchObject({ round, forbidden: false });
    }
  });

  /**
   * Reassignment races on the same lock — and what that does *not* promise.
   *
   * `CategoryResolver.requireActiveBySlug` reads the target category through
   * `lockBySlug` (`FOR SHARE`) inside the draft transaction, so it can never
   * observe a `PUBLISHED` category that a committed archive has already
   * withdrawn. Once the archive commits, the reassignment is refused as
   * `PRODUCT_CATEGORY_INVALID`; that half is asserted deterministically below.
   *
   * What the lock deliberately does **not** do is make a legitimate draft edit
   * fail because an archive happened to start at the same moment. If the
   * reassignment wins the lock, the archive waits and then commits, and the
   * outcome is a *draft* product in an archived category — which breaks nothing:
   * the product has no public page, and it can never acquire one, because
   * publish re-reads the category under the same lock and fails readiness. The
   * forbidden state is a **published** product under an archived category, and
   * that is what this asserts. A stricter rule here would have to block
   * archiving whenever any draft existed in the category, which contradicts the
   * dependency guard's own — correct — rule that drafts do not block archival.
   */
  it('never leaves a reassigned product published under an archived category', async () => {
    const { category } = await seedScenario('quan-theu-dua');
    const drafts = bob.get<ProductDraftService>(ProductDraftService);
    const elsewhere = await seedScenario('quan-theu-dua-khac');

    const results = await Promise.allSettled([
      asAdmin(alice, () =>
        alice.get<AdminCategoryService>(AdminCategoryService).transition({
          categoryId: category.id,
          expectedUpdatedAt: new Date(category.updatedAt),
          action: 'ARCHIVE',
        }),
      ),
      drafts.update({
        productId: elsewhere.product.productId,
        expectedUpdatedAt: new Date(elsewhere.product.updatedAt),
        categorySlug: 'quan-theu-dua',
      }),
    ]);

    const [row] = await alice.snapshot<{ status: string; category_id: string }>(
      sql`select status, category_id from products where id = ${elsewhere.product.productId}`,
    );
    const [categoryRow] = await alice.snapshot<{ status: string }>(
      sql`select status from categories where id = ${category.id}`,
    );

    expect({
      outcomes: results.map(outcomeOf),
      forbidden: categoryRow?.status === 'ARCHIVED' && row?.status === 'PUBLISHED',
    }).toMatchObject({ forbidden: false });
    // Whichever way the race went, the reassignment either landed on a category
    // that was still published at the time, or was refused outright.
    const reassignment = results[1];
    expect(reassignment === undefined ? 'MISSING' : outcomeOf(reassignment)).toMatch(
      /^(OK|PRODUCT_CATEGORY_INVALID)$/,
    );
  });

  /**
   * The deterministic half: once the archive has committed, the category is
   * closed to new work.
   *
   * No race here on purpose — this is the property the lock exists to make true
   * *under* a race, asserted where it can be observed without one.
   */
  it('refuses a reassignment into a category that is already archived', async () => {
    const { category } = await seedScenario('ao-len-theu-dua');
    const elsewhere = await seedScenario('ao-len-theu-dua-khac');

    await asAdmin(alice, () =>
      alice.get<AdminCategoryService>(AdminCategoryService).transition({
        categoryId: category.id,
        expectedUpdatedAt: new Date(category.updatedAt),
        action: 'ARCHIVE',
      }),
    );

    await expect(
      bob.get<ProductDraftService>(ProductDraftService).update({
        productId: elsewhere.product.productId,
        expectedUpdatedAt: new Date(elsewhere.product.updatedAt),
        categorySlug: 'ao-len-theu-dua',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY_INVALID' });

    // And the product never left the category it was in.
    const [row] = await alice.snapshot<{ category_id: string }>(
      sql`select category_id from products where id = ${elsewhere.product.productId}`,
    );
    expect(row?.category_id).not.toBe(category.id);
  });
});
