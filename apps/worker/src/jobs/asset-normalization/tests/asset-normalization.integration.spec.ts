/**
 * `APP3-W01A` normalization against a real database and a real object store.
 *
 * What only a live stack can prove: that the quartet a row carries is the size
 * of the object that actually exists, that
 * `ck_asset_derivatives__ready_normalized_metadata` is satisfied by construction
 * rather than by luck, that the association predicates are the SQL the ruling
 * describes, and that the accepted APP2 outputs are untouched.
 *
 * Every assertion about what was written reads **raw rows and real objects**,
 * never the use case's own return value — a pipeline that lied about what it
 * produced would also lie about what it produced.
 */
import { sql } from '@embroidery/database';

import { jpeg, pngWithAlpha, staticWebp } from '../../asset-inspection/tests/image-fixtures';
import {
  startAssetNormalizationContext,
  type AssetNormalizationContext,
} from './asset-normalization-context';

interface DerivativeRow extends Record<string, unknown> {
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly is_watermarked: boolean;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly media_type: string | null;
  readonly byte_size: string | null;
}

describe('editor-safe normalization (live PostgreSQL + MinIO)', () => {
  let ctx: AssetNormalizationContext;

  beforeAll(async () => {
    ctx = await startAssetNormalizationContext('app3w01a-normalization');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  const derivatives = (assetId: string) =>
    ctx.query<DerivativeRow>(
      sql`select kind, status, storage_key, is_watermarked, width_px, height_px,
                 media_type, byte_size
            from asset_derivatives where asset_id = ${assetId} order by kind`,
    );

  const assetStatus = async (assetId: string): Promise<string> => {
    const [row] = await ctx.query<{ status: string }>(
      sql`select status from assets where id = ${assetId}`,
    );
    return row?.status ?? '';
  };

  /**
   * The stored object's real length, read rather than described.
   *
   * A `HEAD` immediately after a multipart completion was observed to answer
   * 404 intermittently on this MinIO, and once a `GET` did too — in a run whose
   * preceding listing had already returned the key, so the object existed and
   * the container was still making it readable. That is an eventual-consistency
   * property of the disposable stack, not of the consumer, so the read is
   * retried a bounded number of times; a genuinely absent object still fails,
   * just a few hundred milliseconds later.
   */
  async function storedBytes(key: string): Promise<number> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await ctx.storage.getObjectStream({ bucket: 'DERIVATIVES', key });
        let size = 0;
        for await (const chunk of result.body) size += (chunk as Buffer).length;
        return size;
      } catch (error: unknown) {
        if (attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async function normalize(assetId: string, reference: Parameters<typeof ctx.appendEvent>[1]) {
    await ctx.appendEvent(assetId, reference);
    return ctx.useCase.normalize(
      {
        schemaVersion: 1,
        assetId,
        normalizationPolicyVersion: 1,
        associationRef: reference,
      },
      new AbortController().signal,
    );
  }

  describe('the three profiles', () => {
    it('normalizes a Product Side background', async () => {
      const image = await pngWithAlpha(640, 480);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId);

      const result = await normalize(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: sideId,
      });
      expect(result.outcome).toBe('NORMALIZED');

      const rows = await derivatives(assetId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe('NORMALIZED');
      expect(rows[0]?.status).toBe('READY');
      expect(rows[0]?.is_watermarked).toBe(false);
      // The asset's own lifecycle is untouched: normalization is not inspection.
      expect(await assetStatus(assetId)).toBe('ACCEPTED');
    });

    it('normalizes a Template raster asset', async () => {
      const image = await jpeg(800, 600);
      const { assetId } = await ctx.seedAsset(image, { kind: 'TEMPLATE_SOURCE' });
      const association = await ctx.seedTemplateAssociation(assetId);

      const result = await normalize(assetId, {
        kind: 'DESIGN_TEMPLATE_ASSET',
        designTemplateAssetId: association,
      });
      expect(result.outcome).toBe('NORMALIZED');
      expect((await derivatives(assetId))[0]?.status).toBe('READY');
    });

    it('normalizes a Session upload and keeps it private', async () => {
      const image = await staticWebp(320, 240);
      const { assetId } = await ctx.seedAsset(image, {
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
      });
      const association = await ctx.seedSessionAssociation(assetId);

      const result = await normalize(assetId, {
        kind: 'DESIGN_SESSION_ASSET',
        designSessionAssetId: association,
      });
      expect(result.outcome).toBe('NORMALIZED');

      const [row] = await derivatives(assetId);
      expect(row?.status).toBe('READY');
      // The object lives in the private derivatives bucket; no public policy,
      // ACL or presigned address is created anywhere in this checkpoint.
      expect(row?.storage_key).toContain('/derivatives/');
      expect(await storedBytes(row?.storage_key ?? '')).toBeGreaterThan(0);
    });
  });

  describe('the canonical quartet', () => {
    it('describes the exact object that was written', async () => {
      const image = await pngWithAlpha(500, 250);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId);

      const outcome = await normalize(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: sideId,
      });
      expect(outcome.outcome).toBe('NORMALIZED');

      const [row] = await derivatives(assetId);
      const key = row?.storage_key ?? '';
      const listed = await ctx.storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix: `test/derivatives/${assetId}/`,
      });
      expect(listed.map((entry) => entry.key)).toEqual([key]);

      expect(row?.media_type).toBe('image/webp');
      expect(Number(row?.byte_size)).toBe(await storedBytes(key));
      expect(row?.width_px).toBe(500);
      expect(row?.height_px).toBe(250);
      // Never the source's facts: the original is a PNG of a different length.
      expect(row?.media_type).not.toBe(image.mediaType);
      expect(Number(row?.byte_size)).not.toBe(image.byteSize);
    });

    it('is all-or-none, as the database CHECK requires', async () => {
      const image = await jpeg(120, 80);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId);
      await normalize(assetId, { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId });

      const [row] = await derivatives(assetId);
      for (const value of [row?.width_px, row?.height_px, row?.media_type, row?.byte_size]) {
        expect(value).not.toBeNull();
      }
      // Proving the CHECK is real rather than assumed.
      await expect(
        ctx.query(
          sql`update asset_derivatives set width_px = null
               where asset_id = ${assetId} and kind = 'NORMALIZED'`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('a context that no longer authorizes the work', () => {
    it('refuses a retired Product Side and writes nothing', async () => {
      const image = await pngWithAlpha(200, 200);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId, { retired: true });

      const result = await normalize(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: sideId,
      });
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
        expect(result.detail).not.toContain(assetId);
      }
      expect(await derivatives(assetId)).toEqual([]);
    });

    it('refuses an archived Template and a terminal Session', async () => {
      const image = await jpeg(100, 100);

      const template = await ctx.seedAsset(image, { kind: 'TEMPLATE_SOURCE' });
      const archived = await ctx.seedTemplateAssociation(template.assetId, { archived: true });
      const templateResult = await normalize(template.assetId, {
        kind: 'DESIGN_TEMPLATE_ASSET',
        designTemplateAssetId: archived,
      });
      expect(templateResult.outcome).toBe('REJECTED');

      const session = await ctx.seedAsset(image, {
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
      });
      const expired = await ctx.seedSessionAssociation(session.assetId, { status: 'EXPIRED' });
      const sessionResult = await normalize(session.assetId, {
        kind: 'DESIGN_SESSION_ASSET',
        designSessionAssetId: expired,
      });
      expect(sessionResult.outcome).toBe('REJECTED');
      expect(await derivatives(session.assetId)).toEqual([]);
    });

    it('refuses an association that now points at a different Asset', async () => {
      const image = await pngWithAlpha(160, 160);
      const { assetId } = await ctx.seedAsset(image);
      const other = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(other.assetId);

      // The event names `assetId`; the Side names the other one.
      const result = await normalize(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: sideId,
      });
      expect(result.outcome).toBe('REJECTED');
      expect(await derivatives(assetId)).toEqual([]);
    });

    it('refuses an Asset that is not accepted, or tombstoned', async () => {
      const image = await pngWithAlpha(80, 80);
      for (const overrides of [{ status: 'INSPECTING' }, { deleted: true }]) {
        const seeded = await ctx.seedAsset(image, overrides);
        const sideId = await ctx.seedProductSide(seeded.assetId);
        const result = await normalize(seeded.assetId, {
          kind: 'PRODUCT_SIDE_BACKGROUND',
          productSideId: sideId,
        });
        expect(result.outcome).toBe('REJECTED');
        expect(await derivatives(seeded.assetId)).toEqual([]);
      }
    });

    it('refuses an Asset from a lane the profile may not normalize', async () => {
      const image = await jpeg(120, 120);
      // A Template association pointing at a customer upload.
      const { assetId } = await ctx.seedAsset(image, {
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
      });
      const association = await ctx.seedTemplateAssociation(assetId);
      const result = await normalize(assetId, {
        kind: 'DESIGN_TEMPLATE_ASSET',
        designTemplateAssetId: association,
      });
      expect(result.outcome).toBe('REJECTED');
    });
  });

  describe('SVG stays out of the raster lane', () => {
    it('never runs a decoder over markup: a Template SVG is refused as unsafe here', async () => {
      // These bytes are a JPEG recorded as `image/svg+xml`, which is what a
      // swapped object looks like. `APP3-W01B` answers the Template lane's
      // sanitizer verdict rather than a decoder error, and writes nothing.
      const image = await jpeg(64, 64);
      const { assetId } = await ctx.seedAsset(image, {
        kind: 'TEMPLATE_SOURCE',
        mediaType: 'image/svg+xml',
      });
      const association = await ctx.seedTemplateAssociation(assetId);

      const result = await normalize(assetId, {
        kind: 'DESIGN_TEMPLATE_ASSET',
        designTemplateAssetId: association,
      });
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG');
      }
      // A content verdict is reached *after* the claim, because judging content
      // means reading it — so the row exists and is `FAILED`, exactly as an
      // integrity mismatch or an undecodable raster leaves it. What must not
      // exist is a `READY` row or an object.
      const rows = await derivatives(assetId);
      expect(rows.map((row) => [row.kind, row.status])).toEqual([['NORMALIZED', 'FAILED']]);
      expect(rows[0]?.storage_key).toBeNull();
    });

    it('answers a Side or Session SVG as profile-invalid', async () => {
      const image = await jpeg(64, 64);
      const { assetId } = await ctx.seedAsset(image, { mediaType: 'image/svg+xml' });
      const sideId = await ctx.seedProductSide(assetId);

      const result = await normalize(assetId, {
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: sideId,
      });
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
      }
    });
  });

  describe('APP2 behaviour is untouched', () => {
    it('leaves catalogue derivatives alone and adds only NORMALIZED', async () => {
      const image = await pngWithAlpha(300, 200);
      const { assetId } = await ctx.seedAsset(image);
      const sideId = await ctx.seedProductSide(assetId);

      // The two APP2 outputs, exactly as the inspection worker would have left
      // them.
      for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
        await ctx.query(
          sql`insert into asset_derivatives (id, asset_id, kind, status, storage_key,
                                             is_watermarked)
              values (gen_random_uuid(), ${assetId}, ${kind}, 'READY',
                      ${`test/derivatives/${assetId}/${kind}.webp`}, false)`,
        );
      }

      await normalize(assetId, { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId });

      const rows = await derivatives(assetId);
      expect(rows.map((row) => row.kind)).toEqual(['CATALOG_PREVIEW', 'NORMALIZED', 'THUMBNAIL']);
      for (const row of rows.filter((candidate) => candidate.kind !== 'NORMALIZED')) {
        expect(row.status).toBe('READY');
        // Historical rows keep their null metadata: only READY NORMALIZED is
        // required to carry the quartet.
        expect(row.width_px).toBeNull();
      }
    });
  });
});
