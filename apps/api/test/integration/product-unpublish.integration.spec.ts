/**
 * `APP2-B03` unpublish (`TR-LC04-05`) against a real PostgreSQL database.
 *
 * Split from the publish suite by responsibility: unpublish has its own
 * preconditions, its own evidence vocabulary, and one property publish does not
 * have — that it destroys nothing.
 *
 * Every assertion about "nothing was deleted" is made against raw rows rather
 * than against the API's own projection — an API that lied about what it wrote
 * would also lie about what it read back.
 */
import { sql } from 'drizzle-orm';

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
  idList,
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

describe('product unpublish (live PostgreSQL)', () => {
  let ctx: ApiIntegrationTestContext;
  let publication: ProductPublicationService;
  let drafts: ProductDraftService;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createApiIntegrationContext('app2b03-unpublish');
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

  async function publishedProduct() {
    const seeded = await seedPublishableProduct(ctx);
    const published = await asAdmin(ctx, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );
    return { ...seeded, updatedAt: published.updatedAt };
  }

  it('returns a published product to the editable draft state', async () => {
    const product = await publishedProduct();
    const unpublished = await asAdmin(ctx, adminId, () =>
      publication.unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    expect(unpublished.status).toBe('DRAFT');
    expect(new Date(unpublished.updatedAt).getTime()).toBeGreaterThan(
      new Date(product.updatedAt).getTime(),
    );

    // Editable again under the existing DRAFT rules — the whole point of
    // returning to DRAFT rather than inventing an UNPUBLISHED state.
    const edited = await drafts.update({
      productId: product.productId,
      expectedUpdatedAt: new Date(unpublished.updatedAt),
      name: 'Tên đã sửa sau khi gỡ',
    });
    expect(edited.name).toBe('Tên đã sửa sau khi gỡ');
  });

  it('deletes nothing and archives nothing', async () => {
    const product = await publishedProduct();
    const [before] = await productRow(product.productId);
    const mediaBefore = await rows(
      ctx,
      sql`select asset_id, role, display_order from product_media
            where product_id = ${product.productId} order by display_order`,
    );
    const assetsBefore = await rows(
      ctx,
      sql`select id, status from assets where id in ${idList(product.assetIds)} order by id`,
    );
    const derivativesBefore = await rows(
      ctx,
      sql`select asset_id, kind, status, storage_key from asset_derivatives
            where asset_id in ${idList(product.assetIds)} order by asset_id, kind`,
    );

    await asAdmin(ctx, adminId, () =>
      publication.unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    const [after] = await productRow(product.productId);
    expect(after?.status).toBe('DRAFT');
    expect(after?.archived_at).toBeNull();
    // Every field the transition must not touch, compared against the row as
    // it stood while published.
    const { status: _s1, updated_at: _u1, ...restBefore } = before ?? ({} as ProductRow);
    const { status: _s2, updated_at: _u2, ...restAfter } = after ?? ({} as ProductRow);
    expect(restAfter).toEqual(restBefore);

    expect(
      await rows(
        ctx,
        sql`select asset_id, role, display_order from product_media
              where product_id = ${product.productId} order by display_order`,
      ),
    ).toEqual(mediaBefore);
    expect(
      await rows(
        ctx,
        sql`select id, status from assets where id in ${idList(product.assetIds)} order by id`,
      ),
    ).toEqual(assetsBefore);
    expect(
      await rows(
        ctx,
        sql`select asset_id, kind, status, storage_key from asset_derivatives
              where asset_id in ${idList(product.assetIds)} order by asset_id, kind`,
      ),
    ).toEqual(derivativesBefore);
  });

  it('writes exactly one audit row and one outbox event of its own', async () => {
    const product = await publishedProduct();
    await asAdmin(ctx, adminId, () =>
      publication.unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    const audits = await auditRows(product.productId);
    expect(audits.map((row) => row.action)).toEqual(['product.published', 'product.unpublished']);
    expect(audits[1]).toMatchObject({
      summary: { from: 'PUBLISHED', to: 'DRAFT' },
      actor_kind: 'ADMIN',
      reason: null,
    });

    const events = await outboxRows(product.productId);
    expect(events.map((row) => row.event_type)).toEqual([
      'product.published',
      'product.unpublished',
    ]);
  });

  it('does not require the product to still be publishable', async () => {
    const asset = await seedAsset(ctx);
    const seeded = await seedPublishableProduct(ctx, { mediaAssetIds: [asset] });
    const published = await asAdmin(ctx, adminId, () =>
      publication.publish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      }),
    );

    // Readiness collapses while the product is live. Withdrawing it is exactly
    // what an operator needs most in that situation.
    await ctx.database.client.db.execute(
      sql`update assets set status = 'REJECTED' where id = ${asset}`,
    );

    const unpublished = await asAdmin(ctx, adminId, () =>
      publication.unpublish({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(published.updatedAt),
      }),
    );
    expect(unpublished.status).toBe('DRAFT');
  });

  it.each([
    ['a draft', false],
    ['an archived product', true],
  ])('refuses to unpublish %s', async (_label, archive) => {
    const seeded = await seedPublishableProduct(ctx);
    let token = seeded.updatedAt;
    if (archive) {
      const archived = await drafts.archive({
        productId: seeded.productId,
        expectedUpdatedAt: new Date(seeded.updatedAt),
      });
      token = archived.updatedAt;
    }

    expect(
      await codeOf(() =>
        asAdmin(ctx, adminId, () =>
          publication.unpublish({
            productId: seeded.productId,
            expectedUpdatedAt: new Date(token),
          }),
        ),
      ),
    ).toBe('PRODUCT_UNPUBLISH_NOT_ALLOWED');
    expect(await auditRows(seeded.productId)).toEqual([]);
  });

  it('rejects a stale token', async () => {
    const product = await publishedProduct();
    expect(
      await codeOf(() =>
        asAdmin(ctx, adminId, () =>
          publication.unpublish({
            productId: product.productId,
            expectedUpdatedAt: new Date(new Date(product.updatedAt).getTime() - 1000),
          }),
        ),
      ),
    ).toBe('PRODUCT_VERSION_CONFLICT');
    expect((await productRow(product.productId))[0]?.status).toBe('PUBLISHED');
  });

  it('cannot succeed twice with the same token, and says why', async () => {
    const product = await publishedProduct();
    await asAdmin(ctx, adminId, () =>
      publication.unpublish({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
      }),
    );

    // Replay with the token that just worked. The row has moved on in *two*
    // ways — the state and the token — and the token is the more precise
    // answer: a client replaying a stale token needs to reload, which is what
    // this code tells it. The state refusal is reserved for a caller holding a
    // current token against a state that forbids the transition.
    expect(
      await codeOf(() =>
        asAdmin(ctx, adminId, () =>
          publication.unpublish({
            productId: product.productId,
            expectedUpdatedAt: new Date(product.updatedAt),
          }),
        ),
      ),
    ).toBe('PRODUCT_VERSION_CONFLICT');
    // One transition, one publish event and one unpublish event — the replay
    // added nothing.
    expect(await outboxRows(product.productId)).toHaveLength(2);
  });
});
