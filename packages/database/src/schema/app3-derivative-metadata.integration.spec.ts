/**
 * APP3-DB01 — canonical derivative output metadata against a real database
 * (IMP-D044 PO-07 / PO-12).
 *
 * The whole point of this contribution group is that the quartet is *not*
 * optional decoration: an editor-safe derivative that reaches READY without
 * dimensions is precisely the state the Studio would otherwise have to guess
 * about, and guessing is what the ruling forbids. So the assertions here are
 * about which rows PostgreSQL will and will not accept — including the two the
 * ruling deliberately leaves alone: historical `THUMBNAIL` and
 * `CATALOG_PREVIEW` rows, which may stay null forever.
 *
 * It also pins the boundary that produced this checkpoint: `assets.mime_type`
 * and `assets.size_bytes` describe the source binary and satisfy nothing here.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

const CHECK_VIOLATION = '23514';
const CHECKSUM = `sha256:${'a'.repeat(64)}`;

describe('APP3 derivative metadata (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app3db01-derivative');
  }, 180_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  async function insertAsset(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/${id}/original.png`},
              'image/png', 4096, ${CHECKSUM}, 'ACCEPTED')
    `);
    return id;
  }

  interface DerivativeInput {
    readonly kind: string;
    readonly status?: string;
    readonly isWatermarked?: boolean;
    readonly widthPx?: number | null;
    readonly heightPx?: number | null;
    readonly mediaType?: string | null;
    readonly byteSize?: number | null;
  }

  async function insertDerivative(input: DerivativeInput): Promise<string> {
    const id = newId();
    const assetId = await insertAsset();
    const status = input.status ?? 'PENDING';
    const storageKey = status === 'READY' ? `test/derivatives/${id}.webp` : null;
    const isWatermarked = input.isWatermarked ?? input.kind === 'PREVIEW_WATERMARKED';
    await db().execute(sql`
      insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked,
                                     width_px, height_px, media_type, byte_size)
      values (${id}, ${assetId}, ${input.kind}, ${status}, ${storageKey}, ${isWatermarked},
              ${input.widthPx ?? null}, ${input.heightPx ?? null},
              ${input.mediaType ?? null}, ${input.byteSize ?? null})
    `);
    return id;
  }

  const measured = {
    widthPx: 1200,
    heightPx: 800,
    mediaType: 'image/webp',
    byteSize: 65_536,
  } as const;

  describe('the quartet exists as declared', () => {
    it('carries the four columns with their canonical types', async () => {
      const { rows } = await db().execute(sql`
        select column_name, data_type, is_nullable
          from information_schema.columns
         where table_name = 'asset_derivatives'
           and column_name in ('width_px', 'height_px', 'media_type', 'byte_size')
         order by column_name
      `);
      expect(rows).toEqual([
        { column_name: 'byte_size', data_type: 'bigint', is_nullable: 'YES' },
        { column_name: 'height_px', data_type: 'integer', is_nullable: 'YES' },
        { column_name: 'media_type', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'width_px', data_type: 'integer', is_nullable: 'YES' },
      ]);
    });

    it('carries the three metadata CHECK constraints', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where conrelid = 'asset_derivatives'::regclass and contype = 'c'
           and conname like 'ck_asset_derivatives__%metadata%'
         order by conname
      `);
      expect(rows.map((row) => (row as { conname: string }).conname)).toEqual([
        'ck_asset_derivatives__metadata_all_or_none',
        'ck_asset_derivatives__metadata_positive',
        'ck_asset_derivatives__ready_normalized_metadata',
      ]);
    });
  });

  describe('all-or-none', () => {
    it('accepts an all-null quartet on a historical derivative', async () => {
      await expect(insertDerivative({ kind: 'THUMBNAIL' })).resolves.toBeDefined();
      await expect(insertDerivative({ kind: 'MOCKUP', status: 'READY' })).resolves.toBeDefined();
    });

    it('accepts a fully measured quartet', async () => {
      await expect(insertDerivative({ kind: 'THUMBNAIL', ...measured })).resolves.toBeDefined();
    });

    it('rejects every partial quartet', async () => {
      const partials: DerivativeInput[] = [
        { kind: 'THUMBNAIL', widthPx: measured.widthPx },
        { kind: 'THUMBNAIL', widthPx: measured.widthPx, heightPx: measured.heightPx },
        {
          kind: 'THUMBNAIL',
          widthPx: measured.widthPx,
          heightPx: measured.heightPx,
          mediaType: measured.mediaType,
        },
        { kind: 'THUMBNAIL', mediaType: measured.mediaType },
        { kind: 'THUMBNAIL', byteSize: measured.byteSize },
      ];
      for (const partial of partials) {
        expect(await errorCode(() => insertDerivative(partial))).toBe(CHECK_VIOLATION);
      }
    });

    it('rejects clearing one field of a measured row', async () => {
      const id = await insertDerivative({ kind: 'THUMBNAIL', ...measured });
      expect(
        await errorCode(() =>
          db().execute(sql`update asset_derivatives set media_type = null where id = ${id}`),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  describe('positive and non-empty values', () => {
    it('rejects a non-positive dimension or byte size', async () => {
      for (const override of [
        { widthPx: 0 },
        { widthPx: -1 },
        { heightPx: 0 },
        { heightPx: -5 },
        { byteSize: 0 },
        { byteSize: -1 },
      ]) {
        expect(
          await errorCode(() => insertDerivative({ kind: 'THUMBNAIL', ...measured, ...override })),
        ).toBe(CHECK_VIOLATION);
      }
    });

    it('rejects a blank or whitespace-only media type', async () => {
      for (const mediaType of ['', '   ', '\t']) {
        expect(
          await errorCode(() => insertDerivative({ kind: 'THUMBNAIL', ...measured, mediaType })),
        ).toBe(CHECK_VIOLATION);
      }
    });
  });

  describe('READY editor-safe eligibility', () => {
    it('rejects a READY NORMALIZED derivative without the quartet', async () => {
      expect(await errorCode(() => insertDerivative({ kind: 'NORMALIZED', status: 'READY' }))).toBe(
        CHECK_VIOLATION,
      );
    });

    it('accepts a READY NORMALIZED derivative with the quartet', async () => {
      await expect(
        insertDerivative({ kind: 'NORMALIZED', status: 'READY', ...measured }),
      ).resolves.toBeDefined();
    });

    it('still accepts a NORMALIZED row that has not reached READY', async () => {
      await expect(
        insertDerivative({ kind: 'NORMALIZED', status: 'PROCESSING' }),
      ).resolves.toBeDefined();
    });

    it('rejects promoting an unmeasured NORMALIZED row to READY', async () => {
      const id = await insertDerivative({ kind: 'NORMALIZED', status: 'PROCESSING' });
      expect(
        await errorCode(() =>
          db().execute(sql`
            update asset_derivatives
               set status = 'READY', storage_key = ${`test/derivatives/${id}.webp`}
             where id = ${id}
          `),
        ),
      ).toBe(CHECK_VIOLATION);
    });

    it('accepts promotion when the quartet is written in the same statement', async () => {
      const id = await insertDerivative({ kind: 'NORMALIZED', status: 'PROCESSING' });
      await db().execute(sql`
        update asset_derivatives
           set status = 'READY', storage_key = ${`test/derivatives/${id}.webp`},
               width_px = ${measured.widthPx}, height_px = ${measured.heightPx},
               media_type = ${measured.mediaType}, byte_size = ${measured.byteSize}
         where id = ${id}
      `);
      const { rows } = await db().execute(
        sql`select width_px from asset_derivatives where id = ${id}`,
      );
      expect((rows[0] as { width_px: number }).width_px).toBe(measured.widthPx);
    });

    it('leaves historical READY THUMBNAIL and CATALOG_PREVIEW rows unmeasured', async () => {
      await expect(insertDerivative({ kind: 'THUMBNAIL', status: 'READY' })).resolves.toBeDefined();
      await expect(
        insertDerivative({ kind: 'CATALOG_PREVIEW', status: 'READY', isWatermarked: false }),
      ).resolves.toBeDefined();
    });
  });

  describe('the boundary that produced this checkpoint', () => {
    it('does not accept source-Asset metadata in place of derivative metadata', async () => {
      // The source row carries mime_type and size_bytes; the derivative still
      // fails, because those describe a different binary.
      const assetId = await insertAsset();
      const { rows } = await db().execute(
        sql`select mime_type, size_bytes from assets where id = ${assetId}`,
      );
      expect((rows[0] as { mime_type: string }).mime_type).toBe('image/png');

      const id = newId();
      const code = await errorCode(() =>
        db().execute(sql`
          insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
          values (${id}, ${assetId}, 'NORMALIZED', 'READY', ${`test/derivatives/${id}.webp`}, false)
        `),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('adds no forbidden column and no new derivative kind', async () => {
      const { rows: columns } = await db().execute(sql`
        select column_name from information_schema.columns
         where table_name = 'asset_derivatives'
           and column_name in ('inspection_detail_id', 'current_inspection_id',
                               'processing_profile', 'profile', 'is_public', 'grant_purpose')
      `);
      expect(columns).toEqual([]);

      const { rows: kinds } = await db().execute(sql`
        select pg_get_constraintdef(oid) as def from pg_constraint
         where conname = 'ck_asset_derivatives__kind_allowed'
      `);
      const definition = (kinds[0] as { def: string }).def;
      for (const forbidden of [
        'EDITOR_SAFE',
        'STUDIO_PREVIEW',
        'DESIGN_PREVIEW',
        'SESSION_PREVIEW',
      ]) {
        expect(definition).not.toContain(forbidden);
      }
      expect(definition).toContain('NORMALIZED');
    });

    it('keeps the table count unchanged', async () => {
      const { rows } = await db().execute(sql`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect((rows[0] as { n: number }).n).toBe(78);
    });
  });
});
