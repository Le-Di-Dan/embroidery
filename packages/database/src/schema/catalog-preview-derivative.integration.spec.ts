/**
 * APP2-DB01 — the catalog preview derivative against a real, fully migrated
 * database.
 *
 * The static spec proves the tuple; only PostgreSQL can prove the constraint.
 * Every assertion here is about behaviour the application is entitled to rely
 * on: which (kind, is_watermarked) pairs the database accepts, that the four
 * pre-existing kinds still behave exactly as before, and that the surrounding
 * guarantees APP2-DB01 promised not to touch — per-kind uniqueness, the
 * READY/storage-key rule and the append-only inspection trigger — still hold.
 *
 * It also proves the two catalog-lane tuples APP2-W01 will later write are
 * representable *atomically*, without any of W01's runtime code existing.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

/** PostgreSQL's `check_violation`. Asserted by code, never by message text. */
const CHECK_VIOLATION = '23514';
/** `unique_violation`. */
const UNIQUE_VIOLATION = '23505';
/** The S24 mutation-guard triggers raise this class. */
const INTEGRITY_CONSTRAINT_VIOLATION = '23000';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

describe('catalog preview derivative (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app2db01-catalog-preview');
  }, 180_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /** Inserts one CATALOG_MEDIA asset in INSPECTING and returns its id. */
  async function insertAsset(status = 'INSPECTING'): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/originals/${id}/original.png`},
              'image/png', 1024, ${CHECKSUM}, ${status})
    `);
    return id;
  }

  interface DerivativeInput {
    readonly assetId: string;
    readonly kind: string;
    readonly isWatermarked: boolean;
    readonly status?: string;
    readonly storageKey?: string | null;
  }

  async function insertDerivative(input: DerivativeInput): Promise<string> {
    const id = newId();
    const status = input.status ?? 'PENDING';
    const storageKey = input.storageKey === undefined ? null : input.storageKey;
    await db().execute(sql`
      insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked)
      values (${id}, ${input.assetId}, ${input.kind}, ${status}, ${storageKey}, ${input.isWatermarked})
    `);
    return id;
  }

  /**
   * Runs `work` and returns the SQLSTATE it raised.
   *
   * Through `driverErrorCode`, never `error.code`: drizzle wraps the `pg` error
   * and attaches the original as `cause`, so a direct read finds nothing and
   * every assertion here would compare against "undefined" instead of a state.
   */
  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  describe('schema baseline', () => {
    it('applied all 34 migrations onto the 78-table schema', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const tables = await db().execute(sql`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect((applied.rows[0] as { n: number }).n).toBe(34);
      expect((tables.rows[0] as { n: number }).n).toBe(78);
    });

    it('carries every derivative CHECK constraint under its canonical name', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where conrelid = 'asset_derivatives'::regclass and contype = 'c'
         order by conname
      `);
      expect(rows.map((row) => (row as { conname: string }).conname)).toEqual([
        'ck_asset_derivatives__checksum_format',
        'ck_asset_derivatives__kind_allowed',
        // APP3-DB01 / IMP-D044 added the canonical metadata quartet's three.
        'ck_asset_derivatives__metadata_all_or_none',
        'ck_asset_derivatives__metadata_positive',
        'ck_asset_derivatives__ready_has_storage_key',
        'ck_asset_derivatives__ready_normalized_metadata',
        'ck_asset_derivatives__status_allowed',
        'ck_asset_derivatives__watermark_by_kind',
      ]);
    });
  });

  describe('the new kind', () => {
    it('accepts CATALOG_PREVIEW with is_watermarked = false', async () => {
      const assetId = await insertAsset();
      await expect(
        insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: false }),
      ).resolves.toEqual(expect.any(String));
    });

    it('rejects CATALOG_PREVIEW with is_watermarked = true', async () => {
      const assetId = await insertAsset();
      const code = await errorCode(() =>
        insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: true }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects an update that would watermark an existing catalog preview', async () => {
      // The CHECK is a row rule, not an insert rule: the state it forbids must
      // be unreachable by UPDATE too, or the invariant only holds on arrival.
      const assetId = await insertAsset();
      await insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: false });
      const code = await errorCode(() =>
        db().execute(sql`
          update asset_derivatives set is_watermarked = true
           where asset_id = ${assetId} and kind = 'CATALOG_PREVIEW'
        `),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('the watermarked customer preview', () => {
    it('accepts PREVIEW_WATERMARKED with is_watermarked = true', async () => {
      const assetId = await insertAsset();
      await expect(
        insertDerivative({ assetId, kind: 'PREVIEW_WATERMARKED', isWatermarked: true }),
      ).resolves.toEqual(expect.any(String));
    });

    it('rejects PREVIEW_WATERMARKED with is_watermarked = false', async () => {
      // This pairing is exactly the mapping the APP2-W01 gate rejected. Before
      // APP2-DB01 the database accepted it; INV-22 was documentation only.
      const assetId = await insertAsset();
      const code = await errorCode(() =>
        insertDerivative({ assetId, kind: 'PREVIEW_WATERMARKED', isWatermarked: false }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('unconstrained kinds keep their existing freedom', () => {
    it.each([
      ['MOCKUP', true],
      ['MOCKUP', false],
      ['NORMALIZED', true],
      ['NORMALIZED', false],
      ['THUMBNAIL', true],
      ['THUMBNAIL', false],
    ] as const)('accepts %s with is_watermarked = %s', async (kind, isWatermarked) => {
      const assetId = await insertAsset();
      await expect(insertDerivative({ assetId, kind, isWatermarked })).resolves.toEqual(
        expect.any(String),
      );
    });

    it('still rejects a kind outside the closed set', async () => {
      const assetId = await insertAsset();
      const code = await errorCode(() =>
        insertDerivative({ assetId, kind: 'PREVIEW', isWatermarked: false }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('untouched guarantees', () => {
    it('keeps one non-FAILED derivative per (asset, kind)', async () => {
      const assetId = await insertAsset();
      await insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: false });
      const code = await errorCode(() =>
        insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: false }),
      );
      expect(code).toBe(UNIQUE_VIOLATION);
    });

    it('allows a replacement row beside a FAILED one', async () => {
      const assetId = await insertAsset();
      await insertDerivative({
        assetId,
        kind: 'CATALOG_PREVIEW',
        isWatermarked: false,
        status: 'FAILED',
      });
      await expect(
        insertDerivative({ assetId, kind: 'CATALOG_PREVIEW', isWatermarked: false }),
      ).resolves.toEqual(expect.any(String));
    });

    it('still refuses READY without a storage key', async () => {
      const assetId = await insertAsset();
      const code = await errorCode(() =>
        insertDerivative({
          assetId,
          kind: 'CATALOG_PREVIEW',
          isWatermarked: false,
          status: 'READY',
        }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('keeps asset_inspections append-only', async () => {
      const assetId = await insertAsset();
      await db().execute(sql`
        insert into asset_inspections (asset_id, outcome, detail, inspected_at)
        values (${assetId}, 'ACCEPTED', '{"schemaVersion":1}', now())
      `);
      const updateCode = await errorCode(() =>
        db().execute(
          sql`update asset_inspections set outcome = 'REJECTED' where asset_id = ${assetId}`,
        ),
      );
      const deleteCode = await errorCode(() =>
        db().execute(sql`delete from asset_inspections where asset_id = ${assetId}`),
      );
      expect(updateCode).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
      expect(deleteCode).toBe(INTEGRITY_CONSTRAINT_VIOLATION);
    });
  });
});
