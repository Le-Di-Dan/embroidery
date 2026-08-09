/**
 * Published Template asset delivery — transport, against real PostgreSQL and
 * real MinIO (`APP3-B05A` §21).
 *
 * Everything runs through HTTP rather than the service, because the facts this
 * half exists to prove are transport facts: the exact bytes, the exact headers,
 * that a success body is *not* the JSON envelope, that a storage contradiction
 * is a 503 rather than a 404, that twelve reasons produce one indistinguishable
 * answer, and that no read moves a durable row.
 *
 * Revocation — the half that proves an address is not a capability — is its own
 * suite, `public-template-asset-revocation.integration.spec.ts`. The two share
 * one seeder so the Template under test is built by the real
 * `APP3-B03`/`B03A`/`B03B`/`B04` services in both.
 */
import { sql } from 'drizzle-orm';

import {
  ARTWORK,
  NORMALIZED,
  SANITIZED_SVG,
  SECOND_ARTWORK,
  createPublishedTemplateAssetContext,
  type PublishedTemplateAssetContext,
} from '../support/published-template-asset-context';
import { templateAssetPath } from '../support/design-template-delivery-fixtures';

describe('published template asset delivery (integration)', () => {
  let ctx: PublishedTemplateAssetContext;

  beforeAll(async () => {
    ctx = await createPublishedTemplateAssetContext('b05a-template-asset');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe('the happy path', () => {
    it('streams the exact NORMALIZED object', async () => {
      const seeded = await ctx.seedPublished();
      const response = await ctx.fetchPath(seeded.path);

      expect(response.status).toBe(200);
      expect(response.body.equals(ARTWORK)).toBe(true);
    });

    it('sends the ruled headers and the reconciled length', async () => {
      const seeded = await ctx.seedPublished();
      const response = await ctx.fetchPath(seeded.path);

      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['content-length']).toBe(String(ARTWORK.length));
      expect(String(response.headers['content-disposition'])).not.toContain('filename');
      expect(response.headers['etag']).toBeUndefined();
      expect(response.headers['accept-ranges']).toBeUndefined();
    });

    it('delivers sanitized template SVG under its persisted media type', async () => {
      // The only shape of SVG that can reach this route: `APP3-W01B`'s
      // `NORMALIZED` output. The raw original is not a candidate, and nothing
      // here re-parses or re-sanitizes it.
      const seeded = await ctx.seedPublished({
        bytes: SANITIZED_SVG,
        asset: { byteSize: SANITIZED_SVG.length, mediaType: 'image/svg+xml' },
      });
      const response = await ctx.fetchPath(seeded.path);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/svg+xml');
      expect(response.body.equals(SANITIZED_SVG)).toBe(true);
    });

    it('leaks no storage identity in any header, and sends no envelope', async () => {
      const seeded = await ctx.seedPublished();
      const response = await ctx.fetchPath(seeded.path);
      const serialized = JSON.stringify(response.headers);

      for (const forbidden of [
        ctx.media.derivativeKey(seeded.artwork.assetId, NORMALIZED),
        seeded.artwork.derivativeId,
        'DERIVATIVES',
        'amazonaws',
        'minio',
        'sha256',
        NORMALIZED,
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(response.body.subarray(0, 1).toString('utf8')).not.toBe('{');
    });

    it('never returns the private original bytes', async () => {
      const seeded = await ctx.seedPublished();
      const [row] = await ctx.rows<{ storage_key: string }>(
        sql`select storage_key from assets where id = ${seeded.artwork.assetId}`,
      );

      // The original's key is in the ORIGINALS layout and no request reaches it;
      // the delivered bytes are the derivative's, written under DERIVATIVES.
      expect(row?.storage_key).toContain('originals/');
      const response = await ctx.fetchPath(seeded.path);
      expect(response.body.equals(ARTWORK)).toBe(true);
    });
  });

  describe('derivative eligibility', () => {
    it('refuses when no READY NORMALIZED derivative exists', async () => {
      const seeded = await ctx.seedPublished();
      await ctx.rows(
        sql`update asset_derivatives set status = 'PENDING'
            where asset_id = ${seeded.artwork.assetId}`,
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });

    it('refuses a watermarked derivative', async () => {
      const seeded = await ctx.seedPublished();
      await ctx.rows(
        sql`update asset_derivatives set is_watermarked = true
            where asset_id = ${seeded.artwork.assetId}`,
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(404);
    });
  });

  describe('storage contradictions are 503, never 404', () => {
    it('reports a missing object as unavailable', async () => {
      const seeded = await ctx.seedPublished();
      expect((await ctx.fetchPath(seeded.path)).status).toBe(200);

      await ctx.media.removeDerivative(seeded.artwork.assetId, NORMALIZED);

      const response = await ctx.fetchPath(seeded.path);
      expect(response.status).toBe(503);
      expect(response.body.toString('utf8')).not.toContain('DERIVATIVES');
    });

    it('reports a size contradiction as unavailable', async () => {
      const seeded = await ctx.seedPublished();
      await ctx.media.putDerivative(
        seeded.artwork.assetId,
        NORMALIZED,
        Buffer.concat([ARTWORK, ARTWORK]),
      );

      expect((await ctx.fetchPath(seeded.path)).status).toBe(503);
    });
  });

  describe('public non-disclosure', () => {
    it('answers every invisible state identically', async () => {
      const seeded = await ctx.seedPublished();
      const other = await ctx.seedPublished({ bytes: SECOND_ARTWORK });
      const draft = await ctx.admin(() => ctx.drafts.create({ name: 'Bản nháp chưa xuất bản' }));

      const addresses = [
        // unknown slug
        templateAssetPath('khong-ton-tai-bao-gio', 1, seeded.artwork.assetId),
        // a DRAFT template
        templateAssetPath(draft.slug, 1, seeded.artwork.assetId),
        // an unknown version of a published template
        templateAssetPath(seeded.slug, seeded.version + 5, seeded.artwork.assetId),
        // an unknown asset
        templateAssetPath(seeded.slug, seeded.version, crypto.randomUUID()),
        // another template's asset
        templateAssetPath(seeded.slug, seeded.version, other.artwork.assetId),
      ];

      const answers = await Promise.all(addresses.map((path) => ctx.fetchPath(path)));
      const shapes = answers.map((answer) => {
        const body = JSON.parse(answer.body.toString('utf8')) as {
          code?: string;
          message?: string;
        };
        return `${String(answer.status)}:${body.code ?? ''}:${body.message ?? ''}`;
      });

      // One answer, five reasons. No status, code or message separates them.
      expect(new Set(shapes).size).toBe(1);
      expect(shapes[0]).toBe(
        '404:PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND:That design template asset is not available.',
      );
    });

    it('names no slug, version, asset or storage detail in a refusal', async () => {
      const seeded = await ctx.seedPublished();
      const assetId = crypto.randomUUID();
      const response = await ctx.fetchPath(templateAssetPath(seeded.slug, seeded.version, assetId));
      const body = response.body.toString('utf8');

      for (const forbidden of [
        seeded.slug,
        assetId,
        'DERIVATIVES',
        'design_template',
        'PUBLISHED',
      ]) {
        expect(body).not.toContain(forbidden);
      }
    });

    it('refuses a malformed address at the boundary', async () => {
      const seeded = await ctx.seedPublished();
      const base = `/api/public/design-templates/${seeded.slug}/versions`;
      const malformed = [
        `${base}/0/assets/${seeded.artwork.assetId}`,
        `${base}/latest/assets/${seeded.artwork.assetId}`,
        `${base}/1/assets/not-a-uuid`,
      ];

      for (const path of malformed) {
        expect((await ctx.fetchPath(path)).status).toBe(400);
      }
    });
  });

  describe('the read writes nothing', () => {
    const snapshot = async () => ({
      templates: await ctx.count('design_templates'),
      versions: await ctx.count('design_template_versions'),
      associations: await ctx.count('design_template_assets'),
      assets: await ctx.count('assets'),
      derivatives: await ctx.count('asset_derivatives'),
      audit: await ctx.count('audit_events'),
      outbox: await ctx.count('outbox_events'),
    });

    it('moves no durable row across a mixture of served and refused requests', async () => {
      const seeded = await ctx.seedPublished();
      const before = await snapshot();

      await ctx.fetchPath(seeded.path);
      await ctx.fetchPath(seeded.path);
      await ctx.fetchPath(templateAssetPath(seeded.slug, seeded.version, crypto.randomUUID()));
      await ctx.fetchPath(templateAssetPath('khong-co-mau-nay', 1, seeded.artwork.assetId));

      // Deltas, not absolutes: another suite's rows must not be able to make this
      // pass or fail (`APP3-B06B-C1`).
      expect(await snapshot()).toEqual(before);
    });
  });
});
