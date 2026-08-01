/**
 * `APP2-B03` readiness and publish against a real, fully migrated PostgreSQL
 * database. Unpublish has its own suite.
 *
 * What only a live database can prove: that readiness reads exactly the durable
 * facts it claims to, that publish writes exactly the product, audit and outbox
 * rows it claims to and nothing else, and that a refusal leaves no residue.
 *
 * Every assertion about "nothing else changed" is made against raw rows rather
 * than against the API's own projection — an API that lied about what it wrote
 * would also lie about what it read back.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { ProductDraftService } from '../../src/modules/catalog/application/product-draft.service';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  asAdmin,
  rows,
  seedAdminId,
  seedAsset,
  seedPublishableProduct,
} from '../support/product-publication-fixtures';

interface ProductRow extends Record<string, unknown> {
  readonly status: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly base_price_amount: string;
  readonly currency_code: string;
  readonly category_id: string;
  readonly display_order: number;
  readonly is_indexable: boolean;
  readonly seo_title: string | null;
  readonly seo_description: string | null;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

describe('product publication (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let publication: ProductPublicationService;
  let drafts: ProductDraftService;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b03-publication');
    publication = ctx.app.get(ProductPublicationService);
    drafts = ctx.app.get(ProductDraftService);
    adminId = await seedAdminId(ctx);
  }, 240_000);

  afterAll(async () => {
    await ctx?.close();
  }, 240_000);

  async function codeOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'NO_CODE';
    }
    return 'NO_ERROR';
  }

  const productRow = (productId: string) =>
    rows<ProductRow>(ctx, sql`select * from products where id = ${productId}`);

  const auditRows = (productId: string) =>
    rows<{ action: string; actor_kind: string; admin_id: string; summary: Record<string, string> }>(
      ctx,
      sql`select action, actor_kind, admin_id, summary, reason, correlation_id
          from audit_events where target_kind = 'PRODUCT' and target_id = ${productId}
          order by id`,
    );

  const outboxRows = (productId: string) =>
    rows<{ event_type: string; payload: Record<string, unknown>; payload_schema_version: number }>(
      ctx,
      sql`select event_type, aggregate_kind, payload, payload_schema_version, status
          from outbox_events where aggregate_kind = 'PRODUCT' and aggregate_id = ${productId}
          order by id`,
    );

  describe('readiness', () => {
    it('reports a safe 404 for an unknown product', async () => {
      expect(await codeOf(() => publication.readiness(newId()))).toBe('PRODUCT_NOT_FOUND');
    });

    it('finds a complete draft eligible', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const readiness = await publication.readiness(seeded.productId);

      expect(readiness.status).toBe('DRAFT');
      expect(readiness.eligible).toBe(true);
      expect(readiness.requirements.every((r) => r.satisfied)).toBe(true);
      expect(readiness.updatedAt).toBe(seeded.updatedAt);
    });

    it.each([
      [
        'no description',
        { description: undefined as string | undefined },
        'PRODUCT_DESCRIPTION_READY',
      ],
      ['the zero price sentinel', { basePriceAmount: undefined }, 'PRODUCT_PRICE_READY'],
      ['no media', { mediaAssetIds: [] as readonly string[] }, 'PRODUCT_MEDIA_READY'],
    ])('reports %s as the single unsatisfied requirement', async (_label, overrides, expected) => {
      const seeded = await seedPublishableProduct(ctx, overrides);
      const readiness = await publication.readiness(seeded.productId);

      expect(readiness.eligible).toBe(false);
      expect(readiness.requirements.filter((r) => !r.satisfied).map((r) => r.code)).toEqual([
        expected,
      ]);
    });

    it('reports an image that inspection has not accepted', async () => {
      const asset = await seedAsset(ctx, { status: 'ACCEPTED' });
      const seeded = await seedPublishableProduct(ctx, { mediaAssetIds: [asset] });
      // Rejected *after* it was attached: the exact case a publish that trusted
      // the earlier B02 validation would get wrong.
      await ctx.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id = ${asset}`,
      );

      const readiness = await publication.readiness(seeded.productId);
      expect(readiness.requirements.filter((r) => !r.satisfied).map((r) => r.code)).toEqual([
        'PRODUCT_MEDIA_ASSETS_READY',
      ]);
    });

    it.each([
      ['a missing derivative', { readyDerivatives: ['THUMBNAIL'] }],
      [
        'a derivative that is not ready',
        { readyDerivatives: ['THUMBNAIL'], pendingDerivatives: ['CATALOG_PREVIEW'] },
      ],
      [
        'a watermarked derivative instead of a catalog one',
        { readyDerivatives: ['THUMBNAIL'], watermarkedDerivatives: ['PREVIEW_WATERMARKED'] },
      ],
    ])('rejects %s', async (_label, assetOptions) => {
      const asset = await seedAsset(ctx, assetOptions);
      const seeded = await seedPublishableProduct(ctx, { mediaAssetIds: [asset] });

      const readiness = await publication.readiness(seeded.productId);
      expect(readiness.requirements.filter((r) => !r.satisfied).map((r) => r.code)).toEqual([
        'PRODUCT_MEDIA_DERIVATIVES_READY',
      ]);
    });

    it('writes nothing at all', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const before = await productRow(seeded.productId);

      await publication.readiness(seeded.productId);
      await publication.readiness(seeded.productId);

      expect(await productRow(seeded.productId)).toEqual(before);
      expect(await auditRows(seeded.productId)).toEqual([]);
      expect(await outboxRows(seeded.productId)).toEqual([]);
    });
  });

  describe('publish', () => {
    it('publishes an eligible draft and advances the token', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const published = await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      expect(published.status).toBe('PUBLISHED');
      expect(new Date(published.updatedAt).getTime()).toBeGreaterThan(
        new Date(seeded.updatedAt).getTime(),
      );
    });

    it('changes only the lifecycle status and the token', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const [before] = await productRow(seeded.productId);

      await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      const [after] = await productRow(seeded.productId);
      expect(after?.status).toBe('PUBLISHED');
      expect(before?.status).toBe('DRAFT');
      // Everything else is byte-for-byte what it was.
      const { status: _s1, updated_at: _u1, ...restBefore } = before ?? ({} as ProductRow);
      const { status: _s2, updated_at: _u2, ...restAfter } = after ?? ({} as ProductRow);
      expect(restAfter).toEqual(restBefore);
      expect(after?.archived_at).toBeNull();
    });

    it('writes exactly one audit row and one outbox event, in the same transaction', async () => {
      const seeded = await seedPublishableProduct(ctx);
      await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      const audits = await auditRows(seeded.productId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: 'product.published',
        actor_kind: 'ADMIN',
        admin_id: adminId,
        summary: { from: 'DRAFT', to: 'PUBLISHED' },
        reason: null,
      });

      const events = await outboxRows(seeded.productId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event_type: 'product.published',
        payload_schema_version: 1,
        status: 'PENDING',
      });
      expect(Object.keys(events[0]?.payload ?? {}).sort()).toEqual([
        'productId',
        'schemaVersion',
        'slug',
      ]);
    });

    it('rejects a stale token as a version conflict', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const renamed = await drafts.update({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
        name: 'Tên mới',
      });

      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({
              productId: seeded.productId,
              expectedUpdatedAt: new Date(seeded.updatedAt),
            }),
          ),
        ),
      ).toBe('PRODUCT_VERSION_CONFLICT');

      // The fresh token still works, so the refusal was about staleness only.
      const published = await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(renamed.updatedAt),
        }),
      );
      expect(published.status).toBe('PUBLISHED');
    });

    it('leaves zero residue when the product is not ready', async () => {
      const seeded = await seedPublishableProduct(ctx, { description: undefined });
      const [before] = await productRow(seeded.productId);

      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({
              productId: seeded.productId,
              expectedUpdatedAt: new Date(seeded.updatedAt),
            }),
          ),
        ),
      ).toBe('PRODUCT_PUBLICATION_NOT_READY');

      expect(await productRow(seeded.productId)).toEqual([before]);
      expect(await auditRows(seeded.productId)).toEqual([]);
      expect(await outboxRows(seeded.productId)).toEqual([]);
    });

    it('reports the unsatisfied codes as structured detail', async () => {
      const seeded = await seedPublishableProduct(ctx, { description: undefined });
      try {
        await asAdmin(ctx, adminId, () =>
          publication.publish({
            productId: seeded.productId,
            expectedUpdatedAt: new Date(seeded.updatedAt),
          }),
        );
        throw new Error('expected a refusal');
      } catch (error: unknown) {
        expect((error as { details?: string[] }).details).toEqual(['PRODUCT_DESCRIPTION_READY']);
      }
    });

    it('re-evaluates readiness that changed after the readiness call', async () => {
      const asset = await seedAsset(ctx);
      const seeded = await seedPublishableProduct(ctx, { mediaAssetIds: [asset] });
      expect((await publication.readiness(seeded.productId)).eligible).toBe(true);

      // The exact race the design exists for: the facts move between the report
      // and the command.
      await ctx.database.client.db.execute(
        sql`update assets set status = 'REJECTED' where id = ${asset}`,
      );

      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({
              productId: seeded.productId,
              expectedUpdatedAt: new Date(seeded.updatedAt),
            }),
          ),
        ),
      ).toBe('PRODUCT_PUBLICATION_NOT_READY');
      expect((await productRow(seeded.productId))[0]?.status).toBe('DRAFT');
    });

    it('refuses to publish an already published product', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const published = await asAdmin(ctx, adminId, () =>
        publication.publish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(seeded.updatedAt),
        }),
      );

      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({
              productId: seeded.productId,
              expectedUpdatedAt: new Date(published.updatedAt),
            }),
          ),
        ),
      ).toBe('PRODUCT_PUBLISH_NOT_ALLOWED');
      expect(await auditRows(seeded.productId)).toHaveLength(1);
    });

    it('refuses to publish an archived product rather than relisting it', async () => {
      const seeded = await seedPublishableProduct(ctx);
      const archived = await drafts.archive({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      });

      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({
              productId: seeded.productId,
              expectedUpdatedAt: new Date(archived.updatedAt),
            }),
          ),
        ),
      ).toBe('PRODUCT_PUBLISH_NOT_ALLOWED');
      expect((await productRow(seeded.productId))[0]?.status).toBe('ARCHIVED');
    });

    it('reports a safe 404 for an unknown product', async () => {
      expect(
        await codeOf(() =>
          asAdmin(ctx, adminId, () =>
            publication.publish({ productId: newId(), expectedUpdatedAt: new Date() }),
          ),
        ),
      ).toBe('PRODUCT_NOT_FOUND');
    });
  });
});
