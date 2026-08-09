/**
 * Published Template asset delivery — revocation, against real PostgreSQL and
 * real MinIO (`APP3-B05A` §21).
 *
 * A public address is not a capability. The route re-proves publication, the
 * current published Version, that Version's document reference, the durable
 * association and Catalog eligibility on every single request — so unpublishing,
 * archiving, publishing a newer Version, withdrawing the Product and retiring a
 * Side or an Area must each stop the **next** request even for a caller already
 * holding the path.
 *
 * Every case here is asserted the same way: take a path that worked, change one
 * fact somewhere else in the system, and show the same path stops working. That
 * is the only shape of test that can catch an authorization proved once at
 * publication and cached thereafter.
 *
 * The transport half lives in `public-template-asset-delivery.integration.spec.ts`.
 */
import { sql } from 'drizzle-orm';

import {
  ARTWORK,
  SECOND_ARTWORK,
  createPublishedTemplateAssetContext,
  versionOf,
  type PublishedTemplateAssetContext,
} from '../support/published-template-asset-context';
import { templateAssetPath } from '../support/design-template-delivery-fixtures';

describe('published template asset revocation (integration)', () => {
  let ctx: PublishedTemplateAssetContext;

  beforeAll(async () => {
    ctx = await createPublishedTemplateAssetContext('b05a-template-revocation');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe('lifecycle revokes the next request', () => {
    it('stops delivery after unpublish', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.admin(() =>
        ctx.lifecycle.unpublish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it('stops delivery after archive', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.admin(() =>
        ctx.lifecycle.unpublish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );
      await ctx.admin(() =>
        ctx.lifecycle.archive({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
          reason: 'Ngừng sử dụng mẫu này.',
        }),
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it('re-enables only the current public version after republication', async () => {
      const seeded = await ctx.seedPublished();
      await ctx.admin(() =>
        ctx.lifecycle.unpublish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );
      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);

      await ctx.admin(() =>
        ctx.lifecycle.publish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );

      const restored = await ctx.fetchPath(seeded.path);
      expect(restored.status).toBe(200);
      expect(restored.body.equals(ARTWORK)).toBe(true);
    });

    it('retires the previous version address when a newer version is published', async () => {
      // The heart of §4, and the case that caught the unaliased self-join.
      // `published_at` is never cleared, so v1 stays *marked* published forever —
      // and must stop being addressable the moment v2 is the version the public
      // read exposes.
      const seeded = await ctx.seedPublished();
      const oldPath = seeded.path;
      expect((await ctx.fetchPath(oldPath)).status).toBe(200);

      await ctx.admin(() =>
        ctx.lifecycle.unpublish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );
      const saved = await ctx.admin(() =>
        ctx.save.save({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
          document: ctx.documentFor(seeded, [seeded.artwork]),
        }),
      );
      await ctx.admin(() =>
        ctx.lifecycle.publish({
          templateId: seeded.templateId,
          expectedCurrentVersion: versionOf(saved),
        }),
      );

      const newPath = templateAssetPath(seeded.slug, versionOf(saved), seeded.artwork.assetId);
      expect((await ctx.fetchPath(newPath)).status).toBe(200);
      // v1's `published_at` is still set…
      const [historical] = await ctx.rows<{ published_at: string | null }>(
        sql`select published_at from design_template_versions
            where design_template_id = ${seeded.templateId} and version = ${seeded.version}`,
      );
      expect(historical?.published_at).not.toBeNull();
      // …and it authorizes nothing.
      expect((await ctx.fetchPath(oldPath)).status).toBe(404);
    });
  });

  describe('catalog eligibility revokes the next request', () => {
    it('stops delivery when the product leaves the public catalogue', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      const [row] = await ctx.rows<{ updated_at: string }>(
        sql`select updated_at from products where id = ${seeded.productId}`,
      );
      await ctx.admin(() =>
        ctx.publication.unpublish({
          productId: seeded.productId,
          expectedUpdatedAt: new Date(row?.updated_at ?? ''),
        }),
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it('stops delivery when the side is retired', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.rows(
        sql`update product_sides set retired_at = now() where id = ${seeded.productSideId}`,
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it('stops delivery when the area is retired', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.rows(
        sql`update embroidery_areas set retired_at = now() where id = ${seeded.embroideryAreaId}`,
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });
  });

  describe('both halves of the asset proof are required', () => {
    it('refuses an association whose current version no longer places the asset', async () => {
      // `design_template_assets` is cumulative: saving a document without the
      // image leaves the association behind. Association alone must not
      // authorize, or artwork withdrawn from the public design keeps serving.
      const seeded = await ctx.seedPublished();
      await ctx.admin(() =>
        ctx.lifecycle.unpublish({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
        }),
      );
      const saved = await ctx.admin(() =>
        ctx.save.save({
          templateId: seeded.templateId,
          expectedCurrentVersion: seeded.currentVersion,
          document: ctx.documentFor(seeded, []),
        }),
      );
      await ctx.admin(() =>
        ctx.lifecycle.publish({
          templateId: seeded.templateId,
          expectedCurrentVersion: versionOf(saved),
        }),
      );

      const [association] = await ctx.rows<{ n: string }>(
        sql`select count(*)::text as n from design_template_assets
            where design_template_id = ${seeded.templateId}
              and asset_id = ${seeded.artwork.assetId}`,
      );
      expect(association?.n).toBe('1');

      const path = templateAssetPath(seeded.slug, versionOf(saved), seeded.artwork.assetId);
      expect((await ctx.fetchPath(path)).status).toBe(404);
    });

    it('refuses an asset the document references without a durable association', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.rows(
        sql`delete from design_template_assets
            where design_template_id = ${seeded.templateId}
              and asset_id = ${seeded.artwork.assetId}`,
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it("refuses another template's asset at this template's address", async () => {
      const mine = await ctx.seedPublished();
      const theirs = await ctx.seedPublished({ bytes: SECOND_ARTWORK });

      const trespass = templateAssetPath(mine.slug, mine.version, theirs.artwork.assetId);
      expect((await ctx.fetchPath(trespass)).status).toBe(404);
      // …and each address still serves its own bytes.
      expect((await ctx.fetchPath(theirs.path)).body.equals(SECOND_ARTWORK)).toBe(true);
    });
  });
});
