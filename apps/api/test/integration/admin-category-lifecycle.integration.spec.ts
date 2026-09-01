/**
 * `APP12-C02` — the operator category lifecycle, end to end, against a real
 * disposable database.
 *
 * The checkpoint's claim is one sentence: **an operator can create, edit,
 * publish and withdraw a category without a source edit, a migration, a direct
 * database write or a deployment.** This suite is that sentence made
 * falsifiable. The archive dependency guard has its own file
 * (`admin-category-archive-guard.integration.spec.ts`), because it needs
 * publishable Products and is a different question.
 *
 * ## How it proves "no deployment"
 *
 * The application is booted **once**, in `beforeAll`, and never rebuilt,
 * restarted or re-imported. Every category below is created *after* that boot,
 * through the delivered Admin API — no `INSERT` of a category row appears
 * anywhere in this file — and the public inventory is then read over real HTTP
 * from the same process. If any part of the system still held a compiled
 * taxonomy, or if adding a category still required a migration, these
 * assertions could not pass.
 *
 * ## No business data is touched
 *
 * Every row lives in a disposable PostgreSQL database that
 * `createApiIntegrationContext` provisions, migrates and drops; the context
 * refuses by name to run against the development database. The slugs are values
 * no migration ever seeded, so nothing here can pass by accident of `0033`'s
 * reference data — and they are test data, not a taxonomy.
 */
import { sql } from 'drizzle-orm';

import { AdminCategoryService } from '../../src/modules/catalog/application/admin-category.service';
import { createApiIntegrationContext } from '../support/api-integration-context';
import type { ApiIntegrationTestContext } from '../support/api-integration-context';
import { asAdmin, seedAdminId } from '../support/product-publication-fixtures';
import {
  readAdminCategories,
  readPublicInventory,
  rejectsWithCode,
} from '../support/admin-category-fixtures';

jest.setTimeout(240_000);

describe('APP12-C02 operator category lifecycle', () => {
  let ctx: ApiIntegrationTestContext;
  let adminId: string;

  beforeAll(async () => {
    // Booted before any category below exists. Nothing after this line rebuilds,
    // restarts or re-imports the application.
    ctx = await createApiIntegrationContext('app12c02-category-lifecycle');
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const service = (): AdminCategoryService => ctx.app.get(AdminCategoryService);

  /** Every write goes through the delivered API, with a real Admin actor bound. */
  const act = <T>(work: () => Promise<T>): Promise<T> => asAdmin(ctx, adminId, work);

  const publicItems = () => readPublicInventory(ctx);
  const adminItems = () => readAdminCategories(ctx);

  describe('the full lifecycle, with no source edit between steps', () => {
    let categoryId: string;
    let token: string;

    it('creates a DRAFT — never a published category', async () => {
      const created = await act(() =>
        service().create({
          slug: 'khan-tay-theu',
          name: 'Khăn tay thêu',
          isIndexable: true,
          displayOrder: 41,
        }),
      );

      expect(created.status).toBe('DRAFT');
      expect(created.archivedAt).toBeUndefined();
      categoryId = created.id;
      token = created.updatedAt;
    });

    it('shows the draft on the Admin list and nowhere public', async () => {
      const entry = (await adminItems()).find((item) => item.id === categoryId);

      expect(entry).toMatchObject({
        slug: 'khan-tay-theu',
        name: 'Khăn tay thêu',
        status: 'DRAFT',
        isIndexable: true,
        displayOrder: 41,
        publishedProductCount: 0,
      });
      expect((await publicItems()).some((item) => item.slug === 'khan-tay-theu')).toBe(false);
    });

    it('edits every editable field of the draft, slug included', async () => {
      const updated = await act(() =>
        service().update({
          categoryId,
          expectedUpdatedAt: new Date(token),
          slug: 'khan-theu-tay',
          name: 'Khăn thêu tay',
          isIndexable: false,
          displayOrder: 12,
        }),
      );

      expect(updated).toMatchObject({
        slug: 'khan-theu-tay',
        name: 'Khăn thêu tay',
        isIndexable: false,
        displayOrder: 12,
        status: 'DRAFT',
      });
      // The token advanced, strictly.
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(token).getTime());
      token = updated.updatedAt;
    });

    it('publishes it, and the public inventory serves it on the next read', async () => {
      const published = await act(() =>
        service().transition({
          categoryId,
          expectedUpdatedAt: new Date(token),
          action: 'PUBLISH',
        }),
      );

      expect(published.status).toBe('PUBLISHED');
      expect(published.archivedAt).toBeUndefined();
      token = published.updatedAt;

      expect((await publicItems()).find((item) => item.slug === 'khan-theu-tay')).toEqual({
        slug: 'khan-theu-tay',
        name: 'Khăn thêu tay',
        // Published and deliberately non-indexable: browsable, never advertised.
        isIndexable: false,
        displayOrder: 12,
      });
    });

    it('renames a PUBLISHED category without touching its address', async () => {
      const renamed = await act(() =>
        service().update({
          categoryId,
          expectedUpdatedAt: new Date(token),
          name: 'Khăn thêu thủ công',
        }),
      );

      expect(renamed.slug).toBe('khan-theu-tay');
      token = renamed.updatedAt;

      const item = (await publicItems()).find((entry) => entry.slug === 'khan-theu-tay');
      expect(item?.name).toBe('Khăn thêu thủ công');
    });

    it('re-orders and re-indexes from the row, on the next read', async () => {
      const moved = await act(() =>
        service().update({
          categoryId,
          expectedUpdatedAt: new Date(token),
          displayOrder: 0,
          isIndexable: true,
        }),
      );
      token = moved.updatedAt;

      // displayOrder 0 is the lowest in the whole taxonomy, so it now sorts first
      // in both inventories — from the row, with no source change.
      expect((await publicItems())[0]).toMatchObject({
        slug: 'khan-theu-tay',
        isIndexable: true,
      });
      expect((await adminItems())[0]?.slug).toBe('khan-theu-tay');
    });

    it('archives it with no published product, and it leaves every public read', async () => {
      const archived = await act(() =>
        service().transition({
          categoryId,
          expectedUpdatedAt: new Date(token),
          action: 'ARCHIVE',
        }),
      );

      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).toBeDefined();

      expect((await publicItems()).some((item) => item.slug === 'khan-theu-tay')).toBe(false);
    });

    it('still shows the archived category on the Admin list', async () => {
      const entry = (await adminItems()).find((item) => item.id === categoryId);

      expect(entry?.status).toBe('ARCHIVED');
      expect(entry?.archivedAt).toBeDefined();
    });

    it('records one audit row per mutation and one outbox event per transition', async () => {
      const audits = (
        await ctx.database.client.db.execute(sql`
          select action from audit_events
          where target_kind = 'CATEGORY' and target_id = ${categoryId} order by id
        `)
      ).rows as { action: string }[];
      const events = (
        await ctx.database.client.db.execute(sql`
          select event_type from outbox_events
          where aggregate_kind = 'CATEGORY' and aggregate_id = ${categoryId} order by id
        `)
      ).rows as { event_type: string }[];

      expect(audits.map((row) => row.action)).toEqual([
        'category.created',
        'category.updated',
        'category.published',
        'category.updated',
        'category.updated',
        'category.archived',
      ]);
      // Only the two transitions that change public visibility are announced.
      expect(events.map((row) => row.event_type)).toEqual([
        'category.published',
        'category.archived',
      ]);
    });
  });

  describe('the slug lifecycle', () => {
    it('refuses a duplicate slug at create, with a stable business error', async () => {
      const first = await act(() =>
        service().create({
          slug: 'vo-goi-theu',
          name: 'Vỏ gối thêu',
          isIndexable: true,
          displayOrder: 55,
        }),
      );
      expect(first.slug).toBe('vo-goi-theu');

      await rejectsWithCode(
        () =>
          act(() =>
            service().create({
              slug: 'vo-goi-theu',
              name: 'Vỏ gối thêu khác',
              isIndexable: true,
              displayOrder: 56,
            }),
          ),
        'CATEGORY_SLUG_CONFLICT',
      );
    });

    it('refuses a slug another category already holds, at update', async () => {
      const draft = await act(() =>
        service().create({
          slug: 'tap-dem-theu',
          name: 'Tấm đệm thêu',
          isIndexable: true,
          displayOrder: 57,
        }),
      );

      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(draft.updatedAt),
              slug: 'vo-goi-theu',
            }),
          ),
        'CATEGORY_SLUG_CONFLICT',
      );
    });

    it('freezes the slug at publication, and keeps it frozen after archival', async () => {
      const draft = await act(() =>
        service().create({
          slug: 'ruy-bang-theu',
          name: 'Ruy băng thêu',
          isIndexable: true,
          displayOrder: 58,
        }),
      );
      const published = await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(draft.updatedAt),
          action: 'PUBLISH',
        }),
      );

      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(published.updatedAt),
              slug: 'ruy-bang-theu-moi',
            }),
          ),
        'CATEGORY_SLUG_IMMUTABLE',
      );

      const archived = await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(published.updatedAt),
          action: 'ARCHIVE',
        }),
      );

      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(archived.updatedAt),
              slug: 'ruy-bang-theu-cu',
            }),
          ),
        'CATEGORY_SLUG_IMMUTABLE',
      );
      // The row is untouched by either refusal.
      expect((await adminItems()).find((item) => item.id === draft.id)?.slug).toBe('ruy-bang-theu');
    });
  });

  describe('the one-way lifecycle', () => {
    it('refuses every move the lifecycle does not authorise', async () => {
      const draft = await act(() =>
        service().create({
          slug: 'day-deo-theu',
          name: 'Dây đeo thêu',
          isIndexable: true,
          displayOrder: 61,
        }),
      );

      // DRAFT -> ARCHIVED is authorised by LC-04 (TR-LC04-06) but deliberately
      // not delivered on this surface, so it is refused rather than improvised.
      await rejectsWithCode(
        () =>
          act(() =>
            service().transition({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(draft.updatedAt),
              action: 'ARCHIVE',
            }),
          ),
        'CATEGORY_INVALID_TRANSITION',
      );

      const published = await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(draft.updatedAt),
          action: 'PUBLISH',
        }),
      );

      // A repeated PUBLISH is refused, not silently accepted: the second caller
      // is acting on a state that no longer exists and must be told so.
      await rejectsWithCode(
        () =>
          act(() =>
            service().transition({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(published.updatedAt),
              action: 'PUBLISH',
            }),
          ),
        'CATEGORY_INVALID_TRANSITION',
      );

      const archived = await act(() =>
        service().transition({
          categoryId: draft.id,
          expectedUpdatedAt: new Date(published.updatedAt),
          action: 'ARCHIVE',
        }),
      );

      // ARCHIVED -> PUBLISHED (relist, TR-LC04-04) is likewise authorised and
      // likewise not delivered here.
      await rejectsWithCode(
        () =>
          act(() =>
            service().transition({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(archived.updatedAt),
              action: 'PUBLISH',
            }),
          ),
        'CATEGORY_INVALID_TRANSITION',
      );

      // And an archived category takes no edit at all.
      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(archived.updatedAt),
              name: 'Dây đeo',
            }),
          ),
        'CATEGORY_INVALID_TRANSITION',
      );
    });

    it('refuses a stale concurrency token and an unknown category', async () => {
      const draft = await act(() =>
        service().create({
          slug: 'moc-khoa-theu',
          name: 'Móc khóa thêu',
          isIndexable: true,
          displayOrder: 62,
        }),
      );

      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: draft.id,
              expectedUpdatedAt: new Date(new Date(draft.updatedAt).getTime() - 1000),
              name: 'Móc khóa',
            }),
          ),
        'CATEGORY_VERSION_CONFLICT',
      );

      await rejectsWithCode(
        () =>
          act(() =>
            service().update({
              categoryId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099',
              expectedUpdatedAt: new Date(),
              name: 'Không tồn tại',
            }),
          ),
        'CATEGORY_NOT_FOUND',
      );
    });
  });

  describe('the no-deploy proof', () => {
    it('serves a category created and published after boot, with no source edit', async () => {
      const created = await act(() =>
        service().create({
          slug: 'khan-choang-theu',
          name: 'Khăn choàng thêu',
          isIndexable: true,
          displayOrder: 91,
        }),
      );
      expect((await publicItems()).some((item) => item.slug === 'khan-choang-theu')).toBe(false);

      await act(() =>
        service().transition({
          categoryId: created.id,
          expectedUpdatedAt: new Date(created.updatedAt),
          action: 'PUBLISH',
        }),
      );

      // Same process, same build, no restart: the row alone taught it.
      expect((await publicItems()).some((item) => item.slug === 'khan-choang-theu')).toBe(true);
      const filtered = await ctx.http.get('/api/public/products?categorySlug=khan-choang-theu');
      expect(filtered.status).toBe(200);
    });

    it('never publishes a physical category id on the public inventory', async () => {
      for (const item of await publicItems()) {
        expect(Object.keys(item).sort()).toEqual(['displayOrder', 'isIndexable', 'name', 'slug']);
      }
    });

    it('orders the Admin list by displayOrder then slug, across every state', async () => {
      const items = await adminItems();
      const positions = items.map((item) => [item.displayOrder, item.slug] as const);

      expect([...positions].sort(compare)).toEqual(positions);
      // Drafts, published and archived rows all present — this is the whole
      // taxonomy, not the public subset.
      expect(new Set(items.map((item) => item.status)).size).toBeGreaterThan(1);
    });
  });
});

function compare(a: readonly [number, string], b: readonly [number, string]): number {
  return a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0] - b[0];
}
