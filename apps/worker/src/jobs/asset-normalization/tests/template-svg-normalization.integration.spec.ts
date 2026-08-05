/**
 * `APP3-W01B` Template SVG normalization against a real database and a real
 * object store.
 *
 * What only a live stack can prove: that a sanitized Template reaches `READY`
 * with a quartet `ck_asset_derivatives__ready_normalized_metadata` accepts, that
 * the object at the deterministic key is the canonical bytes and nothing else,
 * that two attempts converge instead of one destroying the other's object, and
 * that a Template SVG follows exactly the `APP3-W01A` protocol — same claim,
 * same key shape, same finalization, same cleanup.
 *
 * Every assertion about what was written reads **raw rows and real objects**,
 * never the use case's own return value.
 */
import { createHash } from 'node:crypto';
import { sql } from '@embroidery/database';

import { checksumOf, type SyntheticImage } from '../../asset-inspection/tests/image-fixtures';
import {
  startAssetNormalizationContext,
  type AssetNormalizationContext,
} from './asset-normalization-context';

const NS = 'http://www.w3.org/2000/svg';

const TEMPLATE = `<svg xmlns="${NS}" viewBox="0 0 320 240"><g transform="translate(1,2)"><path d="M0 0L10 10 20 0Z" fill="#F00"/><rect x="0" y="0" width="8" height="8"/></g></svg>`;

const CANONICAL =
  `<svg xmlns="${NS}" viewBox="0 0 320 240"><g transform="translate(1 2)">` +
  '<path d="M0 0L10 10L20 0Z" fill="#ff0000"/><rect height="8" width="8" x="0" y="0"/></g></svg>';

interface DerivativeRow extends Record<string, unknown> {
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly is_watermarked: boolean;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly media_type: string | null;
  readonly byte_size: string | null;
  readonly checksum: string | null;
}

/**
 * A seedable source whose bytes are SVG text.
 *
 * The fixture's `mediaType` decides only the test object key's extension; the
 * **recorded** media type is the `image/svg+xml` override every case passes, and
 * that recorded type is what the consumer dispatches on.
 */
function svgSource(text: string): SyntheticImage {
  const bytes = Buffer.from(text, 'utf8');
  return { bytes, mediaType: 'image/png', byteSize: bytes.length, checksum: checksumOf(bytes) };
}

describe('Template SVG normalization (live PostgreSQL + MinIO)', () => {
  let ctx: AssetNormalizationContext;

  beforeAll(async () => {
    ctx = await startAssetNormalizationContext('app3w01b-template-svg');
  }, 300_000);

  afterAll(async () => {
    await ctx?.close();
  }, 300_000);

  const derivatives = (assetId: string) =>
    ctx.query<DerivativeRow>(
      sql`select kind, status, storage_key, is_watermarked, width_px, height_px,
                 media_type, byte_size, checksum
            from asset_derivatives where asset_id = ${assetId} order by kind`,
    );

  /** The stored object, read rather than described. Bounded retry as W01A's. */
  async function storedObject(key: string): Promise<Buffer> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await ctx.storage.getObjectStream({ bucket: 'DERIVATIVES', key });
        const chunks: Buffer[] = [];
        for await (const chunk of result.body) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks);
      } catch (error: unknown) {
        if (attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async function seedTemplate(text: string): Promise<{ assetId: string; association: string }> {
    const { assetId } = await ctx.seedAsset(svgSource(text), {
      kind: 'TEMPLATE_SOURCE',
      mediaType: 'image/svg+xml',
    });
    return { assetId, association: await ctx.seedTemplateAssociation(assetId) };
  }

  async function normalize(assetId: string, association: string) {
    const reference = {
      kind: 'DESIGN_TEMPLATE_ASSET',
      designTemplateAssetId: association,
    } as const;
    await ctx.appendEvent(assetId, reference);
    return ctx.useCase.normalize(
      { schemaVersion: 1, assetId, normalizationPolicyVersion: 1, associationRef: reference },
      new AbortController().signal,
    );
  }

  describe('a valid Template completes', () => {
    it('writes the canonical object and a READY row carrying the exact quartet', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);

      const result = await normalize(assetId, association);
      expect(result.outcome).toBe('NORMALIZED');

      const rows = await derivatives(assetId);
      expect(rows).toHaveLength(1);
      const row = rows[0] as DerivativeRow;
      expect(row.kind).toBe('NORMALIZED');
      expect(row.status).toBe('READY');
      // Private and unwatermarked: sanitization does not authorize delivery.
      expect(row.is_watermarked).toBe(false);
      expect(row.media_type).toBe('image/svg+xml');
      expect(row.width_px).toBe(320);
      expect(row.height_px).toBe(240);
      expect(row.storage_key).toBe(`test/derivatives/${assetId}/NORMALIZED.svg`);

      const object = await storedObject(row.storage_key as string);
      expect(object.toString('utf8')).toBe(CANONICAL);
      expect(row.byte_size).toBe(String(object.length));
      expect(row.checksum).toBe(`sha256:${createHash('sha256').update(object).digest('hex')}`);
    });

    it('leaves the asset lifecycle alone: normalization is not inspection', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);
      await normalize(assetId, association);
      const [row] = await ctx.query<{ status: string }>(
        sql`select status from assets where id = ${assetId}`,
      );
      expect(row?.status).toBe('ACCEPTED');
    });
  });

  describe('idempotency and concurrency', () => {
    it('replays an existing result without writing a second row', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);
      const first = await normalize(assetId, association);
      const second = await normalize(assetId, association);

      expect(first.outcome).toBe('NORMALIZED');
      expect(second.outcome).toBe('ALREADY_NORMALIZED');
      expect(await derivatives(assetId)).toHaveLength(1);
    });

    it('converges when two attempts race, and the winner keeps its bytes', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);

      const [left, right] = await Promise.all([
        normalize(assetId, association),
        normalize(assetId, association),
      ]);
      for (const outcome of [left.outcome, right.outcome]) {
        expect(['NORMALIZED', 'ALREADY_NORMALIZED']).toContain(outcome);
      }

      const rows = await derivatives(assetId);
      expect(rows).toHaveLength(1);
      // The loser must not have deleted the winner's object at the shared
      // deterministic key — the defect `APP3-W01A` was corrected for.
      const object = await storedObject(rows[0]?.storage_key as string);
      expect(object.toString('utf8')).toBe(CANONICAL);
      expect(rows[0]?.byte_size).toBe(String(object.length));
    });

    it('produces the same digest for the same source across independent assets', async () => {
      const digests = new Set<string>();
      for (let run = 0; run < 3; run += 1) {
        const { assetId, association } = await seedTemplate(TEMPLATE);
        await normalize(assetId, association);
        const rows = await derivatives(assetId);
        digests.add(rows[0]?.checksum as string);
      }
      expect(digests.size).toBe(1);
    });
  });

  describe('the association still decides', () => {
    it('refuses a retired Template association, even with bytes that would pass', async () => {
      const { assetId } = await ctx.seedAsset(svgSource(TEMPLATE), {
        kind: 'TEMPLATE_SOURCE',
        mediaType: 'image/svg+xml',
      });
      const association = await ctx.seedTemplateAssociation(assetId, { archived: true });

      const result = await normalize(assetId, association);
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
      }
      expect(await derivatives(assetId)).toEqual([]);
    });

    it('refuses a stale context even when a good derivative already exists', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);
      expect((await normalize(assetId, association)).outcome).toBe('NORMALIZED');

      // Archiving lives on the owning Template, not on the association row, so
      // this is exactly the "the owner moved" case rather than a doctored link.
      await ctx.query(
        sql`update design_templates set archived_at = now()
             where id = (select design_template_id from design_template_assets
                          where id = ${association})`,
      );

      const result = await normalize(assetId, association);
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
      }
    });

    it('refuses SVG on a Product Side and on a Session upload', async () => {
      const side = await ctx.seedAsset(svgSource(TEMPLATE), { mediaType: 'image/svg+xml' });
      const sideId = await ctx.seedProductSide(side.assetId);
      const sideReference = { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: sideId } as const;
      await ctx.appendEvent(side.assetId, sideReference);
      const sideResult = await ctx.useCase.normalize(
        {
          schemaVersion: 1,
          assetId: side.assetId,
          normalizationPolicyVersion: 1,
          associationRef: sideReference,
        },
        new AbortController().signal,
      );
      expect(sideResult.outcome).toBe('REJECTED');
      if (sideResult.outcome === 'REJECTED') {
        expect(sideResult.code).toBe('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
      }
      expect(await derivatives(side.assetId)).toEqual([]);

      const session = await ctx.seedAsset(svgSource(TEMPLATE), {
        kind: 'CUSTOMER_UPLOAD',
        classification: 'CUSTOMER_PRIVATE',
        mediaType: 'image/svg+xml',
      });
      const sessionId = await ctx.seedSessionAssociation(session.assetId);
      const sessionReference = {
        kind: 'DESIGN_SESSION_ASSET',
        designSessionAssetId: sessionId,
      } as const;
      await ctx.appendEvent(session.assetId, sessionReference);
      const sessionResult = await ctx.useCase.normalize(
        {
          schemaVersion: 1,
          assetId: session.assetId,
          normalizationPolicyVersion: 1,
          associationRef: sessionReference,
        },
        new AbortController().signal,
      );
      expect(sessionResult.outcome).toBe('REJECTED');
      if (sessionResult.outcome === 'REJECTED') {
        expect(sessionResult.code).toBe('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
      }
      expect(await derivatives(session.assetId)).toEqual([]);
    });
  });

  describe('unsafe content is refused with nothing left behind', () => {
    it.each([
      [
        'a script element',
        `<svg xmlns="${NS}" viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
      ],
      ['a foreignObject', `<svg xmlns="${NS}" viewBox="0 0 10 10"><foreignObject/></svg>`],
      [
        'an external reference',
        `<svg xmlns="${NS}" viewBox="0 0 10 10"><image href="x.png"/></svg>`,
      ],
      [
        'an XXE payload',
        `<!DOCTYPE s [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="${NS}"/>`,
      ],
      ['a fractional viewBox', `<svg xmlns="${NS}" viewBox="0 0 10.5 10"><path d="M0 0Z"/></svg>`],
      [
        'a style attribute',
        `<svg xmlns="${NS}" viewBox="0 0 10 10"><path d="M0 0Z" style="fill:red"/></svg>`,
      ],
    ])('refuses %s, writes no row and no object', async (_label, text) => {
      const { assetId, association } = await seedTemplate(text);

      const result = await normalize(assetId, association);
      expect(result.outcome).toBe('REJECTED');
      if (result.outcome === 'REJECTED') {
        expect(result.code).toBe('UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG');
      }
      // No READY row, and no `PROCESSING` claim left holding the partial index.
      const rows = await derivatives(assetId);
      expect(rows.filter((row) => row.status === 'READY')).toEqual([]);
      expect(rows.filter((row) => row.status === 'PROCESSING')).toEqual([]);
    });

    it('leaves no object at the deterministic key when the file is refused', async () => {
      const { assetId, association } = await seedTemplate(
        `<svg xmlns="${NS}" viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
      );
      await normalize(assetId, association);
      await expect(
        ctx.storage.getObjectStream({
          bucket: 'DERIVATIVES',
          key: `test/derivatives/${assetId}/NORMALIZED.svg`,
        }),
      ).rejects.toBeDefined();
    });
  });

  describe('APP2 derivatives are untouched', () => {
    it('adds only NORMALIZED beside the catalogue outputs', async () => {
      const { assetId, association } = await seedTemplate(TEMPLATE);
      for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW']) {
        await ctx.query(
          sql`insert into asset_derivatives (id, asset_id, kind, status, storage_key,
                                             is_watermarked)
              values (gen_random_uuid(), ${assetId}, ${kind}, 'READY',
                      ${`test/derivatives/${assetId}/${kind}.webp`}, false)`,
        );
      }

      await normalize(assetId, association);

      const rows = await derivatives(assetId);
      expect(rows.map((row) => row.kind)).toEqual(['CATALOG_PREVIEW', 'NORMALIZED', 'THUMBNAIL']);
      for (const row of rows.filter((candidate) => candidate.kind !== 'NORMALIZED')) {
        expect(row.status).toBe('READY');
        expect(row.width_px).toBeNull();
      }
    });
  });
});
