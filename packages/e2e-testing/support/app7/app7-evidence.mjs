/**
 * Read-only APP7 database evidence for the `E01` acceptance run.
 *
 * The same two rules `support/app4/db-evidence.mjs` states, and the first one is
 * that module's own implementation: every row is projected through
 * {@link projectSafe}, which *removes* any column whose name looks
 * secret-bearing and reports its presence as a `has…` boolean. That pattern
 * matches `code`, so `orders.code` never leaves here as a value — the run learns
 * the order code from the customer's own deposit screen and the Admin's own
 * payment panel, which is where a person learns it, and reaches the row again
 * through {@link findOrderIdByCode}, where the code is a *parameter*.
 *
 * The second rule is that there is **no generic SQL console**: each function
 * below answers one question an E01 case actually asks, scoped to one order, one
 * obligation or one attempt. Nothing here can list a table it was not written
 * for, and nothing here writes.
 *
 * The connection is this module's own pool, never the graph under test's. A
 * broken read must not be able to report itself as a consistent one.
 *
 * Test-only. Never imported by application code.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';
import { evidenceClientConfig, projectSafe } from '../app4/db-evidence.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/**
 * Every table an APP8 write would land in (`APP7-E01` §7 E01-01/02/06).
 *
 * Named as data rather than as six hand-written counts so the assertion is
 * "no APP8 table has a row", not "these particular six queries returned zero" —
 * and so a table added to the inventory or production schema shows up here as a
 * missing entry rather than as silence.
 */
export const APP8_TABLES = Object.freeze([
  'inventory_reservations',
  'inventory_soft_holds',
  'inventory_ledger_entries',
  'production_jobs',
  'production_job_transitions',
  'production_specifications',
  'production_artifacts',
]);

/**
 * `currency_code` under a name the safety filter does not withhold.
 *
 * {@link projectSafe} matches `code` anywhere in a column name — which is what
 * keeps `orders.code` out of every evidence value, and is deliberate. It also
 * catches `currency_code`, a value that is neither secret nor a locator and that
 * `APP7-E01` has to assert exactly (the obligation's own VND, copied, never a
 * mark a screen chose). Aliasing it is narrower than loosening the filter: one
 * named column is admitted, and the rule that protects everything else is
 * untouched.
 */
const CURRENCY_ALIAS = 'currency_code AS currency';

export async function createApp7Evidence(databaseUrl) {
  const { createDatabaseClient, executeRaw, sql } = requireFromApi('@embroidery/database');
  const client = createDatabaseClient(evidenceClientConfig(databaseUrl));

  const rows = async (statement) => {
    const result = await executeRaw(client.db, statement);
    return Array.isArray(result) ? result : (result?.rows ?? []);
  };
  const many = async (statement) => (await rows(statement)).map(projectSafe);
  const one = async (statement) => (await many(statement))[0];
  const count = async (statement) => Number((await rows(statement))[0]?.count ?? 0);

  return {
    // ---- Order conversion (W01) -------------------------------------------

    /** Every order this approval produced. The count is the CC-11 assertion. */
    listOrdersForRequest: (customRequestId) =>
      many(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM orders WHERE custom_request_id = ${customRequestId}
               ORDER BY created_at ASC`),

    countOrdersForRequest: (customRequestId) =>
      count(sql`SELECT COUNT(*)::int AS count FROM orders
                WHERE custom_request_id = ${customRequestId}`),

    readOrder: (orderId) =>
      one(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM orders WHERE id = ${orderId}`),

    /**
     * The order id behind a customer-visible code.
     *
     * The code is a bound parameter and is never returned, so a run that only
     * knows what the screen showed can still reach the row without the code
     * appearing in an evidence value.
     */
    findOrderIdByCode: async (code) => {
      const found = await rows(sql`SELECT id FROM orders WHERE code = ${code}`);
      return found[0]?.id;
    },

    listOrderItems: (orderId) =>
      many(
        sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM order_items WHERE order_id = ${orderId} ORDER BY position ASC`,
      ),

    countOrderItems: (orderId) =>
      count(sql`SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = ${orderId}`),

    listOrderTransitions: (orderId) =>
      many(sql`SELECT * FROM order_transitions WHERE order_id = ${orderId}
               ORDER BY created_at ASC, id ASC`),

    countOrderTransitionsTo: (orderId, toStatus) =>
      count(sql`SELECT COUNT(*)::int AS count FROM order_transitions
                WHERE order_id = ${orderId} AND to_status = ${toStatus}`),

    // ---- Obligations -------------------------------------------------------

    listObligations: (orderId) =>
      many(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM payment_obligations WHERE order_id = ${orderId}
               ORDER BY kind ASC`),

    readObligation: (obligationId) =>
      one(
        sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM payment_obligations WHERE id = ${obligationId}`,
      ),

    findObligation: (orderId, kind) =>
      one(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM payment_obligations
              WHERE order_id = ${orderId} AND kind = ${kind}`),

    // ---- Attempts, evidence, reconciliation --------------------------------

    listAttempts: (obligationId) =>
      many(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM payment_attempts WHERE payment_obligation_id = ${obligationId}
               ORDER BY created_at ASC, id ASC`),

    readAttempt: (attemptId) =>
      one(sql`SELECT *, ${sql.raw(CURRENCY_ALIAS)} FROM payment_attempts WHERE id = ${attemptId}`),

    countAttempts: (obligationId) =>
      count(sql`SELECT COUNT(*)::int AS count FROM payment_attempts
                WHERE payment_obligation_id = ${obligationId}`),

    listTransferEvidence: (attemptId) =>
      many(sql`SELECT * FROM payment_transfer_evidence WHERE payment_attempt_id = ${attemptId}
               ORDER BY created_at ASC, id ASC`),

    /**
     * The inspection state of the asset behind one evidence association.
     *
     * Joined rather than exposed as an asset reader: `APP7-B06` addresses the
     * association, and a helper that could read an asset by its own id would
     * let a case assert something the delivered surface cannot do.
     */
    readEvidenceAssetStatus: async (evidenceId) => {
      const found = await rows(sql`
        SELECT a.status AS status, a.mime_type AS mime_type, a.size_bytes AS size_bytes
          FROM payment_transfer_evidence e
          JOIN assets a ON a.id = e.asset_id
         WHERE e.id = ${evidenceId}`);
      return projectSafe(found[0]);
    },

    listReconciliations: (obligationId) =>
      many(sql`SELECT * FROM payment_reconciliations
               WHERE payment_obligation_id = ${obligationId}
               ORDER BY created_at ASC, id ASC`),

    countReconciliations: (obligationId) =>
      count(sql`SELECT COUNT(*)::int AS count FROM payment_reconciliations
                WHERE payment_obligation_id = ${obligationId}`),

    // ---- Events ------------------------------------------------------------

    /** Rows of one event type naming one aggregate. `payment.verified` is 1. */
    countEventsFor: (eventType, aggregateId) =>
      count(sql`SELECT COUNT(*)::int AS count FROM outbox_events
                WHERE event_type = ${eventType} AND aggregate_id = ${aggregateId}`),

    countEventsOfType: (eventType) =>
      count(sql`SELECT COUNT(*)::int AS count FROM outbox_events
                WHERE event_type = ${eventType}`),

    /** No provider is contacted in APP7; this table must stay empty. */
    countProviderEvents: () =>
      count(sql`SELECT COUNT(*)::int AS count FROM payment_provider_events`),

    countRefunds: () => count(sql`SELECT COUNT(*)::int AS count FROM refunds`),

    // ---- APP8 boundary -----------------------------------------------------

    /**
     * A row count per APP8 table, keyed by name.
     *
     * `to_regclass` first, so a table that has not been created yet reports
     * `null` rather than throwing — E01 asserts APP7 wrote nothing, and a
     * missing table is a stronger form of that, not a harness failure.
     */
    countApp8Writes: async () => {
      const result = {};
      for (const table of APP8_TABLES) {
        const exists = await rows(sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ok`);
        result[table] = exists[0]?.ok === true ? await count(tableCount(sql, table)) : null;
      }
      return result;
    },
    close: async () => {
      await client.close?.();
    },
  };
}

/**
 * A `COUNT(*)` over one name from {@link APP8_TABLES}.
 *
 * The name is interpolated because an identifier cannot be a bind parameter, so
 * it is checked against the frozen list first: this function can only ever count
 * one of seven known tables, and never a string a caller supplied.
 */
function tableCount(sql, table) {
  if (!APP8_TABLES.includes(table)) {
    throw new Error('APP7-E01 evidence: unknown APP8 table.');
  }
  return sql.raw(`SELECT COUNT(*)::int AS count FROM ${table}`);
}
