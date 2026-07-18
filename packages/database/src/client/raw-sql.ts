/**
 * Sanctioned raw-SQL boundary (ADR-DB1-002, DB6 §23).
 *
 * The DB6 capability spikes showed the query builder expresses every lock mode
 * the concurrency design needs, so raw SQL is *not* the fallback for locking.
 * It exists for the cases an ORM genuinely cannot express — trigger/function
 * DDL, catalog introspection, and DB8's contention fallbacks.
 *
 * The one hard rule: parameters travel as bound parameters. Never build a
 * statement by concatenating or interpolating values into the string.
 */
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';

import type { Database } from './create-database-client';
import type { Transaction } from './transaction';

export type SqlExecutor = Database | Transaction;

/**
 * Runs a parameterised statement.
 *
 * Callers build the statement with the `sql` template tag, which turns every
 * `${value}` into a bound parameter ($1, $2, ...) rather than inlining it:
 *
 * ```ts
 * await executeRaw(db, sql`select id from orders where code = ${code}`);
 * ```
 */
export async function executeRaw<TRow extends QueryResultRow>(
  executor: SqlExecutor,
  statement: SQL,
): Promise<readonly TRow[]> {
  const result = await executor.execute<TRow>(statement);
  return result.rows as readonly TRow[];
}

/** Re-exported so call sites never reach past this boundary for the tag. */
export { sql };
