/**
 * APP5-DB01 — customer intake provenance, against a real fully migrated
 * database.
 *
 * `APP5-B02` stopped because nothing recorded *which verification challenge*
 * authorized a pre-submission upload, leaving `G01-D13`'s per-challenge quota
 * and `G01` §7's orphan expiry unenforceable. This suite proves the two columns
 * that close that gap behave as the blocked checkpoint needs them to — not that
 * they exist, which the drizzle schema already says, but that PostgreSQL
 * refuses the rows APP5-B02 must never be able to write.
 *
 * The load-bearing case is §"challenge deletion": the challenge family is
 * hard-TTL-deleted, so an expiry that vanished with its parent would leave the
 * future sweep no due time and every unbound upload unreachable. The asymmetry
 * between the two CHECKs exists entirely to make that survival legal.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

/** PostgreSQL's `check_violation`. Asserted by code, never by message text. */
const CHECK_VIOLATION = '23514';
/** `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';

const CHECKSUM = `sha256:${'a'.repeat(64)}`;

const FULL_MIGRATION_COUNT = 35;
const TABLE_COUNT = 78;

interface AssetRow {
  readonly uploaded_via_challenge_id: string | null;
  readonly uploaded_via_session_id: string | null;
  /** Raw `execute` returns timestamptz as the unparsed text PostgreSQL sent. */
  readonly intake_expires_at: string | null;
}

describe('APP5 intake provenance (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app5db01-intake-provenance');
  }, 240_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /**
   * Runs `work` and returns the SQLSTATE it raised.
   *
   * Through `driverErrorCode`, never `error.code`: drizzle wraps the `pg` error
   * and attaches the original as `cause`, so a direct read finds nothing.
   */
  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  async function insertChallenge(status = 'VERIFIED'): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into contact_verification_challenges
             (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${id}, 'EMAIL', ${`c-${id}@example.test`}, 'SUBMISSION', ${`hash-${id}`},
              ${status}, now() + interval '30 minutes',
              ${status === 'VERIFIED' ? sql`now()` : sql`null`})
    `);
    return id;
  }

  async function insertCategory(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${id}, 'Test', ${`cat-${id}`}, 1, 'PUBLISHED', true)
    `);
    return id;
  }

  async function insertCatalogAsset(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/${id}/original.png`},
              'image/png', 1024, ${CHECKSUM}, 'ACCEPTED')
    `);
    return id;
  }

  /** A real design session — the other intake lane, seeded rather than faked. */
  async function insertSession(): Promise<string> {
    const categoryId = await insertCategory();
    const productId = newId();
    await db().execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code,
                            status, is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Test product', ${`p-${productId}`}, 100000, 'VND',
              'PUBLISHED', false, 1, true)
    `);
    const sideId = newId();
    await db().execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id,
                                 image_width_px, image_height_px,
                                 physical_width_mm, physical_height_mm, px_per_mm, display_order)
      values (${sideId}, ${productId}, ${`s-${sideId.slice(0, 8)}`}, 'Front',
              ${await insertCatalogAsset()}, 1000, 1000, 200, 200, 5, 1)
    `);
    const areaId = newId();
    await db().execute(sql`
      insert into embroidery_areas (id, product_side_id, code, name,
                                    bound_x_px, bound_y_px, bound_width_px, bound_height_px,
                                    max_width_mm, max_height_mm, display_order)
      values (${areaId}, ${sideId}, ${`a-${areaId.slice(0, 8)}`}, 'Chest',
              10, 10, 100, 100, 50, 50, 1)
    `);
    const sessionId = newId();
    await db().execute(sql`
      insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                   embroidery_area_id, design_document, document_schema_version,
                                   autosave_revision, status, expires_at, last_activity_at)
      values (${sessionId}, ${`hash-${sessionId}`}, ${productId}, ${sideId}, ${areaId},
              '{}'::jsonb, 1, 0, 'ACTIVE', now() + interval '30 days', now())
    `);
    return sessionId;
  }

  interface IntakeAssetInput {
    readonly challengeId?: string | null;
    readonly sessionId?: string | null;
    readonly expiresIn?: string | null;
    readonly status?: string;
  }

  /** One CUSTOMER_UPLOAD / CUSTOMER_PRIVATE asset — the only bindable shape. */
  async function insertIntakeAsset(input: IntakeAssetInput = {}): Promise<string> {
    const id = newId();
    const challengeId = input.challengeId ?? null;
    const sessionId = input.sessionId ?? null;
    const expiry =
      input.expiresIn === null || input.expiresIn === undefined
        ? sql`null`
        : sql`now() + ${input.expiresIn}::interval`;
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes,
                          checksum, status, uploaded_via_challenge_id, uploaded_via_session_id,
                          intake_expires_at)
      values (${id}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE', ${`intake/${id}/original.jpg`},
              'image/jpeg', 2048, ${CHECKSUM}, ${input.status ?? 'ACCEPTED'},
              ${challengeId}, ${sessionId}, ${expiry})
    `);
    return id;
  }

  async function readAsset(id: string): Promise<AssetRow> {
    const { rows } = await db().execute(sql`
      select uploaded_via_challenge_id, uploaded_via_session_id, intake_expires_at
        from assets where id = ${id}
    `);
    return rows[0] as unknown as AssetRow;
  }

  /** `EXPLAIN (format text)` returns one single-column row per plan line. */
  function planText(rows: readonly unknown[]): string {
    return rows.map((row) => Object.values(row as Record<string, string>)[0] ?? '').join('\n');
  }

  describe('schema baseline', () => {
    it('applied all 35 migrations onto the 78-table schema', async () => {
      const applied = await db().execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      );
      const tables = await db().execute(sql`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `);
      expect((applied.rows[0] as { n: number }).n).toBe(FULL_MIGRATION_COUNT);
      expect((tables.rows[0] as { n: number }).n).toBe(TABLE_COUNT);
    });

    it('carries both new columns, nullable, with the canonical types', async () => {
      const { rows } = await db().execute(sql`
        select column_name, data_type, is_nullable
          from information_schema.columns
         where table_schema = 'public' and table_name = 'assets'
           and column_name in ('uploaded_via_challenge_id', 'intake_expires_at')
         order by column_name
      `);
      expect(rows).toEqual([
        {
          column_name: 'intake_expires_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
        },
        { column_name: 'uploaded_via_challenge_id', data_type: 'uuid', is_nullable: 'YES' },
      ]);
    });

    it('carries REL-106 as a SET NULL foreign key onto the challenge table', async () => {
      const { rows } = await db().execute(sql`
        select c.confdeltype, t.relname as target
          from pg_constraint c
          join pg_class t on t.oid = c.confrelid
         where c.conname = 'fk_assets__uploaded_via_challenge_id' and c.contype = 'f'
      `);
      expect(rows).toHaveLength(1);
      // 'n' is SET NULL. `restrict` would block the challenge TTL sweep;
      // `cascade` would delete an asset row whose binary still exists.
      expect(rows[0]).toEqual({ confdeltype: 'n', target: 'contact_verification_challenges' });
    });

    it('carries CST-127 and CST-128 by name', async () => {
      const { rows } = await db().execute(sql`
        select conname from pg_constraint
         where conrelid = 'assets'::regclass and contype = 'c'
           and conname in ('ck_assets__single_intake_lane',
                           'ck_assets__challenge_intake_requires_expiry')
         order by conname
      `);
      expect(rows.map((r) => (r as { conname: string }).conname)).toEqual([
        'ck_assets__challenge_intake_requires_expiry',
        'ck_assets__single_intake_lane',
      ]);
    });

    it('carries both intake indexes with non-volatile predicates', async () => {
      const { rows } = await db().execute(sql`
        select i.relname, pg_get_expr(x.indpred, x.indrelid) as pred
          from pg_index x
          join pg_class i on i.oid = x.indexrelid
         where x.indrelid = 'assets'::regclass
           and i.relname in ('ix_assets__challenge_status__intake_live',
                             'ix_assets__intake_expires_id__live')
         order by i.relname
      `);
      expect(rows).toHaveLength(2);
      for (const row of rows as unknown as { pred: string }[]) {
        expect(row.pred).toContain('IS NOT NULL');
        expect(row.pred.toLowerCase()).not.toContain('now(');
      }
    });
  });

  describe('existing data stays valid', () => {
    it('accepts an asset with both new fields NULL — no backfill exists', async () => {
      const id = await insertIntakeAsset();
      const row = await readAsset(id);
      expect(row.uploaded_via_challenge_id).toBeNull();
      expect(row.intake_expires_at).toBeNull();
    });

    it('accepts the pre-existing session lane, still with no expiry', async () => {
      const sessionId = await insertSession();
      const id = await insertIntakeAsset({ sessionId });
      const row = await readAsset(id);
      expect(row.uploaded_via_session_id).toBe(sessionId);
      expect(row.uploaded_via_challenge_id).toBeNull();
      expect(row.intake_expires_at).toBeNull();
    });
  });

  describe('the challenge lane', () => {
    it('accepts challenge provenance carrying its own expiry', async () => {
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });
      const row = await readAsset(id);
      expect(row.uploaded_via_challenge_id).toBe(challengeId);
      expect(row.intake_expires_at).not.toBeNull();
    });

    it('rejects challenge provenance without an expiry (CST-128)', async () => {
      const challengeId = await insertChallenge();
      const code = await errorCode(() => insertIntakeAsset({ challengeId, expiresIn: null }));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects clearing the expiry of an existing challenge-lane row', async () => {
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });
      const code = await errorCode(() =>
        db().execute(sql`update assets set intake_expires_at = null where id = ${id}`),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects a challenge id that does not exist (REL-106)', async () => {
      const code = await errorCode(() =>
        insertIntakeAsset({ challengeId: newId(), expiresIn: '30 minutes' }),
      );
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    });

    it('accepts an expiry with no challenge — the post-deletion shape', async () => {
      const id = await insertIntakeAsset({ expiresIn: '30 minutes' });
      const row = await readAsset(id);
      expect(row.uploaded_via_challenge_id).toBeNull();
      expect(row.intake_expires_at).not.toBeNull();
    });
  });

  describe('one lane per row (CST-127)', () => {
    it('rejects an insert claiming both a session and a challenge', async () => {
      const sessionId = await insertSession();
      const challengeId = await insertChallenge();
      const code = await errorCode(() =>
        insertIntakeAsset({ sessionId, challengeId, expiresIn: '30 minutes' }),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('rejects adding the second lane to an existing single-lane row', async () => {
      const sessionId = await insertSession();
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ sessionId });
      const code = await errorCode(() =>
        db().execute(sql`
          update assets
             set uploaded_via_challenge_id = ${challengeId},
                 intake_expires_at = now() + interval '30 minutes'
           where id = ${id}
        `),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('challenge deletion preserves the due time', () => {
    it('clears the pointer and keeps intake_expires_at byte-for-byte', async () => {
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });
      const before = await readAsset(id);
      expect(before.uploaded_via_challenge_id).toBe(challengeId);

      // The real hard-TTL delete, not a simulated one.
      await db().execute(
        sql`delete from contact_verification_challenges where id = ${challengeId}`,
      );

      const after = await readAsset(id);
      expect(after.uploaded_via_challenge_id).toBeNull();
      expect(after.intake_expires_at).toEqual(before.intake_expires_at);
    });

    it('leaves the surviving row satisfying both CHECKs', async () => {
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });
      await db().execute(
        sql`delete from contact_verification_challenges where id = ${challengeId}`,
      );
      // A reverse implication (expiry ⇒ challenge id) would have made the
      // parent's own TTL deletion violate this table's CHECK. Touching the row
      // proves the surviving shape is still writable, not merely readable.
      await db().execute(sql`update assets set updated_at = now() where id = ${id}`);
      const row = await readAsset(id);
      expect(row.intake_expires_at).not.toBeNull();
    });

    it('does not delete the asset row — the binary still exists (INV-10)', async () => {
      const challengeId = await insertChallenge();
      const id = await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });
      await db().execute(
        sql`delete from contact_verification_challenges where id = ${challengeId}`,
      );
      const { rows } = await db().execute(
        sql`select count(*)::int as n from assets where id = ${id}`,
      );
      expect((rows[0] as { n: number }).n).toBe(1);
    });
  });

  describe('access paths', () => {
    /**
     * PostgreSQL will not choose an index on a table this small, so the planner
     * is asked with sequential scans disabled: the question is whether the
     * index *can* answer the quota query, not what the planner prefers at three
     * rows. `G01-D13` counts ACCEPTED, non-deleted rows for one challenge.
     */
    it('answers the per-challenge quota count from the quota index', async () => {
      const challengeId = await insertChallenge();
      await insertIntakeAsset({ challengeId, expiresIn: '30 minutes' });

      await db().execute(sql`set local enable_seqscan = off`);
      const { rows } = await db().execute(sql`
        explain (format text)
        select count(*) from assets
         where uploaded_via_challenge_id = ${challengeId}
           and status = 'ACCEPTED' and deleted_at is null
      `);
      expect(planText(rows)).toContain('ix_assets__challenge_status__intake_live');
    });

    it('answers the orphan due-time lookup from the due-time index', async () => {
      await insertIntakeAsset({ expiresIn: '-1 minutes' });

      await db().execute(sql`set local enable_seqscan = off`);
      const { rows } = await db().execute(sql`
        explain (format text)
        select id from assets
         where intake_expires_at < now() and deleted_at is null
         order by intake_expires_at, id
      `);
      expect(planText(rows)).toContain('ix_assets__intake_expires_id__live');
    });
  });
});
