/**
 * APP7-DB01 — `payment_transfer_evidence` against a real fully migrated
 * database.
 *
 * The checkpoint's claims are all physical, so every one of them is asserted
 * against PostgreSQL rather than read out of the TypeScript schema: a
 * `.onDelete('restrict')` in a drizzle table says what the author intended, not
 * what the database installed, and the two have diverged before.
 *
 * Three things this suite is built to catch:
 *
 * 1. **An accidental single-evidence table.** `UNIQUE (payment_attempt_id,
 *    asset_id)` and `UNIQUE (payment_attempt_id)` are one keystroke apart and
 *    both accept the first row, so a table capped at one image per attempt
 *    would pass any test that inserts once. The cardinality test therefore
 *    inserts a *second distinct* asset against the same attempt and requires it
 *    to succeed.
 * 2. **A quota silently made physical.** `MAX_EVIDENCE_PER_ATTEMPT = 5` is an
 *    application guard under the attempt row lock (APP7-G01 §7.2). The database
 *    must accept a sixth row; if it refuses one, the guard has been encoded in
 *    the wrong layer and APP7-B05 would be enforcing a rule twice.
 * 3. **A `cascade` that reads as `restrict`.** Both delete tests delete the
 *    parent for real and assert the SQLSTATE, because a `cascade` would delete
 *    the evidence row and report success — the failure mode is silent.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';
import { insertEvidenceAsset, seedPaymentAttemptChain } from './app7-transfer-evidence-fixture';
import type { PaymentAttemptChain } from './app7-transfer-evidence-fixture';

/** PostgreSQL's `foreign_key_violation`. Asserted by code, never by message. */
const FK_VIOLATION = '23503';
/** PostgreSQL's `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

describe('APP7 payment transfer evidence association (integration)', () => {
  let disposable: DisposableDatabase;
  let chain: PaymentAttemptChain;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app7db01-transfer-evidence');
    chain = await seedPaymentAttemptChain(disposable.client.db);
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

  async function bind(attemptId: string, assetId: string, id = newId()): Promise<void> {
    await db().execute(sql`
      insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
      values (${id}, ${attemptId}, ${assetId})
    `);
  }

  describe('physical shape', () => {
    it('has exactly the four authorized columns and no other', async () => {
      const { rows } = await db().execute<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(sql`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = 'payment_transfer_evidence'
        order by column_name
      `);
      expect(rows.map((r) => r.column_name)).toEqual([
        'asset_id',
        'created_at',
        'id',
        'payment_attempt_id',
      ]);
      expect(rows.every((r) => r.is_nullable === 'NO')).toBe(true);
    });

    it('carries no role, no convenience reference, no media metadata and no JSONB', async () => {
      const { rows } = await db().execute<{ column_name: string; data_type: string }>(sql`
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public' and table_name = 'payment_transfer_evidence'
      `);
      const names = rows.map((r) => r.column_name);
      for (const forbidden of [
        'role',
        'kind',
        'status',
        'order_id',
        'payment_obligation_id',
        'custom_request_id',
        'customer_id',
        'grant_id',
        'step_up_challenge_id',
        'submitted_at',
        'verified_at',
        'reviewed_at',
        'admin_id',
        'sort_order',
        'display_order',
        'notes',
        'metadata',
        'mime_type',
        'media_type',
        'size_bytes',
        'byte_size',
        'original_filename',
        'storage_key',
        'object_key',
        'updated_at',
      ]) {
        expect(names).not.toContain(forbidden);
      }
      expect(rows.map((r) => r.data_type)).not.toContain('jsonb');
    });

    it('has no CHECK constraint and no trigger — the five-per-attempt bound is not physical', async () => {
      const { rows: checks } = await db().execute<{ conname: string }>(sql`
        select con.conname from pg_constraint con
        join pg_class t on t.oid = con.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
          and con.contype = 'c'
      `);
      expect(checks).toEqual([]);

      const { rows: triggers } = await db().execute<{ tgname: string }>(sql`
        select tg.tgname from pg_trigger tg
        join pg_class t on t.oid = tg.tgrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
          and not tg.tgisinternal
      `);
      expect(triggers).toEqual([]);
    });

    it('is keyed on id and unique on the (attempt, asset) pair only', async () => {
      const { rows } = await db().execute<{ conname: string; contype: string; def: string }>(sql`
        select con.conname, con.contype::text as contype, pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class t on t.oid = con.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
          and con.contype in ('p', 'u')
        order by con.contype
      `);
      expect(rows).toEqual([
        {
          conname: 'pk_payment_transfer_evidence',
          contype: 'p',
          def: 'PRIMARY KEY (id)',
        },
        {
          conname: 'uq_payment_transfer_evidence__attempt_asset',
          contype: 'u',
          def: 'UNIQUE (payment_attempt_id, asset_id)',
        },
      ]);
    });

    it('leaves payment_attempt_id and asset_id individually non-unique', async () => {
      const { rows } = await db().execute<{ indexdef: string }>(sql`
        select pg_get_indexdef(i.indexrelid) as indexdef
        from pg_index i
        join pg_class t on t.oid = i.indrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
          and i.indisunique
      `);
      const singleColumnUniques = rows.filter(
        (r) => r.indexdef.includes('(payment_attempt_id)') || r.indexdef.includes('(asset_id)'),
      );
      expect(singleColumnUniques).toEqual([]);
    });

    it('adds no explicit index beyond the two constraint-created ones', async () => {
      const { rows } = await db().execute<{ indexname: string }>(sql`
        select i.relname as indexname
        from pg_index x
        join pg_class t on t.oid = x.indrelid
        join pg_class i on i.oid = x.indexrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
        order by i.relname
      `);
      expect(rows.map((r) => r.indexname)).toEqual([
        'pk_payment_transfer_evidence',
        'uq_payment_transfer_evidence__attempt_asset',
      ]);
    });
  });

  describe('foreign keys', () => {
    it('declares both edges NOT NULL and ON DELETE RESTRICT in the live catalog', async () => {
      const { rows } = await db().execute<{ conname: string; confdeltype: string }>(sql`
        select con.conname, con.confdeltype::text as confdeltype
        from pg_constraint con
        join pg_class t on t.oid = con.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'payment_transfer_evidence'
          and con.contype = 'f'
        order by con.conname
      `);
      expect(rows).toEqual([
        { conname: 'fk_payment_transfer_evidence__asset_id', confdeltype: 'r' },
        { conname: 'fk_payment_transfer_evidence__payment_attempt_id', confdeltype: 'r' },
      ]);
    });

    it('accepts a valid attempt + valid asset', async () => {
      const assetId = await insertEvidenceAsset(db());
      await expect(bind(chain.paymentAttemptId, assetId)).resolves.toBeUndefined();
    });

    it('refuses an unknown payment attempt', async () => {
      const assetId = await insertEvidenceAsset(db());
      expect(await errorCode(() => bind(newId(), assetId))).toBe(FK_VIOLATION);
    });

    it('refuses an unknown asset', async () => {
      expect(await errorCode(() => bind(chain.paymentAttemptId, newId()))).toBe(FK_VIOLATION);
    });

    it('refuses a NULL on either edge', async () => {
      const assetId = await insertEvidenceAsset(db());
      const nullAttempt = await errorCode(() =>
        db().execute(sql`
          insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
          values (${newId()}, null, ${assetId})
        `),
      );
      const nullAsset = await errorCode(() =>
        db().execute(sql`
          insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
          values (${newId()}, ${chain.paymentAttemptId}, null)
        `),
      );
      // 23502 — not_null_violation.
      expect([nullAttempt, nullAsset]).toEqual(['23502', '23502']);
    });
  });

  describe('cardinality and uniqueness', () => {
    it('binds many distinct assets to one attempt but refuses a duplicate pair', async () => {
      const local = await seedPaymentAttemptChain(db());
      const assetA = await insertEvidenceAsset(db());
      const assetB = await insertEvidenceAsset(db());

      await bind(local.paymentAttemptId, assetA);
      expect(await errorCode(() => bind(local.paymentAttemptId, assetA))).toBe(UNIQUE_VIOLATION);
      await bind(local.paymentAttemptId, assetB);

      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from payment_transfer_evidence
        where payment_attempt_id = ${local.paymentAttemptId}
      `);
      expect(rows[0]?.n).toBe('2');
    });

    it('accepts a sixth row — the five-per-attempt bound belongs to APP7-B05, not here', async () => {
      const local = await seedPaymentAttemptChain(db());
      for (let i = 0; i < 6; i += 1) {
        await bind(local.paymentAttemptId, await insertEvidenceAsset(db()));
      }
      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from payment_transfer_evidence
        where payment_attempt_id = ${local.paymentAttemptId}
      `);
      expect(rows[0]?.n).toBe('6');
    });

    it('lets one asset be bound to two different attempts', async () => {
      const first = await seedPaymentAttemptChain(db());
      const second = await seedPaymentAttemptChain(db());
      const assetId = await insertEvidenceAsset(db());

      await bind(first.paymentAttemptId, assetId);
      await expect(bind(second.paymentAttemptId, assetId)).resolves.toBeUndefined();
    });
  });

  describe('retention', () => {
    it('refuses to delete a payment attempt that still has evidence', async () => {
      const local = await seedPaymentAttemptChain(db());
      await bind(local.paymentAttemptId, await insertEvidenceAsset(db()));

      const code = await errorCode(() =>
        db().execute(sql`delete from payment_attempts where id = ${local.paymentAttemptId}`),
      );
      expect(code).toBe(FK_VIOLATION);

      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from payment_transfer_evidence
        where payment_attempt_id = ${local.paymentAttemptId}
      `);
      expect(rows[0]?.n).toBe('1');
    });

    it('refuses to delete an asset that is still bound as evidence', async () => {
      const local = await seedPaymentAttemptChain(db());
      const assetId = await insertEvidenceAsset(db());
      await bind(local.paymentAttemptId, assetId);

      const code = await errorCode(() =>
        db().execute(sql`delete from assets where id = ${assetId}`),
      );
      expect(code).toBe(FK_VIOLATION);

      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from payment_transfer_evidence where asset_id = ${assetId}
      `);
      expect(rows[0]?.n).toBe('1');
    });
  });

  describe('collateral', () => {
    it('adds no asset kind or classification value', async () => {
      const { rows } = await db().execute<{ def: string }>(sql`
        select pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class t on t.oid = con.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'assets'
          and con.conname in ('ck_assets__kind_allowed', 'ck_assets__classification_allowed')
      `);
      const text = rows.map((r) => r.def).join(' ');
      expect(text).not.toContain('PAYMENT_EVIDENCE');
      expect(text).not.toContain('BANK_TRANSFER_RECEIPT');
      expect(text).not.toContain('PAYMENT_PRIVATE');
      expect(text).toContain('CUSTOMER_UPLOAD');
      expect(text).toContain('CUSTOMER_PRIVATE');
    });

    it('leaves payment_attempts without an asset_id column', async () => {
      const { rows } = await db().execute<{ column_name: string }>(sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'payment_attempts'
          and column_name = 'asset_id'
      `);
      expect(rows).toEqual([]);
    });

    it('introduces no generic asset_links table', async () => {
      const { rows } = await db().execute<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'asset_links'
      `);
      expect(rows).toEqual([]);
    });
  });
});
