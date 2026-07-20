/**
 * DB7-CP2 — the error mapper against errors PostgreSQL actually raises.
 *
 * The unit suite proves the classification table; this one proves the codes the
 * *live* schema produces reach that table at all — constraint names really are
 * spelled the way the catalogue expects, and the S24 triggers really do raise
 * `23000`. A mismatch between the two is exactly the failure a mocked test
 * cannot catch.
 */
import { sql } from 'drizzle-orm';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';
import { withTransaction } from '../client/transaction';
import { newId } from '../primitives/identifiers';
import { CATALOGUED_CONSTRAINTS } from './constraint-catalog';
import { mapDatabaseError } from './map-database-error';
import type { PersistenceError } from './persistence-error';

describe('database error mapping (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('cp2-error-mapping');
  }, 120_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /** Runs `statement` and returns the mapped error it raised. Fails if it did not raise. */
  async function mappedFailure(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      return mapDatabaseError(error, 'IntegrationProbe.run');
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  async function insertRedirect(sourcePath: string, kind = 'PERMANENT'): Promise<void> {
    await db().execute(sql`
      insert into redirect_rules (id, source_path, target_path, redirect_kind, is_active)
      values (${newId()}, ${sourcePath}, '/target', ${kind}, true)
    `);
  }

  async function insertSystemAuditEvent(): Promise<string> {
    const correlationId = newId();
    await db().execute(sql`
      insert into audit_events
        (occurred_at, actor_kind, system_job_key, action, target_kind, target_id, correlation_id)
      values (now(), 'SYSTEM', 'db7-probe', 'PROBE', 'ORDER', ${newId()}, ${correlationId})
    `);
    return correlationId;
  }

  describe('constraint violations through the real call path', () => {
    it('maps a named unique arbiter to its catalogued business code', async () => {
      await insertRedirect('/mapped-unique');

      const error = await mappedFailure(() => insertRedirect('/mapped-unique'));

      expect(error.kind).toBe('CONFLICT');
      expect(error.code).toBe('DUPLICATE_REDIRECT_SOURCE');
      expect(error.diagnostics.sqlState).toBe('23505');
      expect(error.diagnostics.constraint).toBe('uq_redirect_rules__source_path');
    });

    it('maps a foreign-key violation to an invalid reference', async () => {
      const error = await mappedFailure(() =>
        db().execute(sql`
          insert into audit_events
            (occurred_at, actor_kind, admin_id, action, target_kind, target_id, correlation_id)
          values (now(), 'ADMIN', ${newId()}, 'PROBE', 'ORDER', ${newId()}, ${newId()})
        `),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
      expect(error.code).toBe('REFERENCE_NOT_FOUND');
      expect(error.diagnostics.sqlState).toBe('23503');
    });

    it('maps a CHECK violation to an invariant violation', async () => {
      const error = await mappedFailure(() => insertRedirect('/bad-kind', 'SIDEWAYS'));

      expect(error.kind).toBe('INVARIANT_VIOLATION');
      expect(error.code).toBe('VALUE_NOT_ALLOWED');
      expect(error.diagnostics.sqlState).toBe('23514');
      expect(error.diagnostics.constraint).toBe('ck_redirect_rules__kind_allowed');
    });

    it('maps a NOT NULL violation to a missing required value', async () => {
      const error = await mappedFailure(() =>
        db().execute(sql`
          insert into redirect_rules (id, source_path, target_path, redirect_kind, is_active)
          values (${newId()}, null, '/target', 'PERMANENT', true)
        `),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
      expect(error.code).toBe('REQUIRED_VALUE_MISSING');
      expect(error.diagnostics.sqlState).toBe('23502');
    });
  });

  describe('S24 immutability triggers', () => {
    it('maps a rejected UPDATE on an append-only row to IMMUTABLE_RECORD', async () => {
      const correlationId = await insertSystemAuditEvent();

      const error = await mappedFailure(() =>
        db().execute(
          sql`update audit_events set action = 'TAMPERED' where correlation_id = ${correlationId}`,
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
      expect(error.code).toBe('IMMUTABLE_RECORD');
      // DB6 documented 23001 for these on the SQLSTATE constant; the trigger
      // body and DB6_S24_TRIGGER_REPORT both say 23000. This asserts which.
      expect(error.diagnostics.sqlState).toBe('23000');
    });

    it('maps a rejected DELETE on an append-only row to IMMUTABLE_RECORD', async () => {
      const correlationId = await insertSystemAuditEvent();

      const error = await mappedFailure(() =>
        db().execute(sql`delete from audit_events where correlation_id = ${correlationId}`),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
      expect(error.diagnostics.sqlState).toBe('23000');
    });

    it('never surfaces the trigger message, which names the table', async () => {
      const correlationId = await insertSystemAuditEvent();

      const error = await mappedFailure(() =>
        db().execute(
          sql`update audit_events set action = 'TAMPERED' where correlation_id = ${correlationId}`,
        ),
      );

      expect(error.message).toBe('This record is immutable and cannot be changed or removed.');
      expect(error.message).not.toContain('audit_events');
      expect(error.message).not.toContain('immutability violation');
    });
  });

  describe('transaction-scoped failures', () => {
    it('maps a write inside a read-only transaction', async () => {
      // The write must go through `tx`, not the pool handle: issuing it on the
      // pool would run outside the read-only transaction and quietly succeed —
      // precisely the mistake DEC-DB7-006's ambient executor removes for
      // repository code, which never sees a handle to pick from.
      const error = await mappedFailure(() =>
        withTransaction(
          db(),
          (tx) =>
            tx.execute(sql`
              insert into redirect_rules (id, source_path, target_path, redirect_kind, is_active)
              values (${newId()}, '/read-only-probe', '/target', 'PERMANENT', true)
            `),
          { readOnly: true },
        ),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
      expect(error.code).toBe('READ_ONLY_TRANSACTION');
      expect(error.diagnostics.sqlState).toBe('25006');
    });

    it('maps a cancelled statement to a timeout', async () => {
      const error = await mappedFailure(() =>
        withTransaction(db(), async (tx) => {
          await tx.execute(sql`set local statement_timeout = 50`);
          await tx.execute(sql`select pg_sleep(2)`);
        }),
      );

      expect(error.kind).toBe('CONCURRENT_MODIFICATION');
      expect(error.code).toBe('OPERATION_TIMED_OUT');
      expect(error.diagnostics.sqlState).toBe('57014');
    });
  });

  describe('catalogue integrity', () => {
    it('names only constraints and indexes that exist in the live schema', async () => {
      const result = await db().execute<{ name: string }>(sql`
        select conname as name from pg_constraint
        where connamespace = 'public'::regnamespace
        union
        select indexname as name from pg_indexes where schemaname = 'public'
      `);
      const live = new Set(result.rows.map((row) => row.name));

      const missing = CATALOGUED_CONSTRAINTS.filter((name) => !live.has(name));
      expect(missing).toEqual([]);
    });

    it('covers every uniqueness arbiter whose duplicate means "replay"', () => {
      // These three are the arbiters a caller must be able to treat as a
      // successful duplicate rather than an error. A missing entry here would
      // turn an idempotent retry into a 500.
      const replayArbiters = [
        'uq_idempotency_records__namespace_scope_key',
        'uq_payment_provider_events__provider_key__provider_event_ref',
        'uq_notification_intents__intent_key',
      ];

      expect(CATALOGUED_CONSTRAINTS).toEqual(expect.arrayContaining(replayArbiters));
    });
  });

  describe('leak safety on real errors', () => {
    it('does not carry the Postgres message or DETAIL into the mapped message', async () => {
      await insertRedirect('/leak-probe');
      const error = await mappedFailure(() => insertRedirect('/leak-probe'));

      expect(error.message).toBe('A redirect already exists for that path.');
      expect(error.message).not.toContain('duplicate key');
      expect(error.message).not.toContain('/leak-probe');
      expect(JSON.stringify({ ...error })).not.toContain('uq_redirect_rules');
    });
  });
});
