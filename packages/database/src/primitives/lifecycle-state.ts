/**
 * Lifecycle-state primitives (ADR-DB1-008, DB3 lifecycles, DB5-A09).
 *
 * States are stored as `text` with a CHECK constraint, not as a PostgreSQL
 * enum: enums make adding or reordering a value a migration on the type
 * itself, and DB3's lifecycles are expected to gain states.
 *
 * DB5-A09 requires one canonical source for each state set. Each lifecycle
 * declares its values **once** as a `const` tuple; the CHECK constraint, the
 * partial-index predicates and the TypeScript union all derive from that tuple,
 * so a literal cannot drift between the database and the code. The database
 * check still stands on its own as an independent guard on the data.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { text } from 'drizzle-orm/pg-core';

/** A lifecycle-state column, e.g. `status`. */
export function stateColumn(name = 'status') {
  return text(name);
}

/**
 * Renders a SQL string literal for use in DDL.
 *
 * DDL cannot carry bound parameters. Interpolating a value with the `sql` tag
 * (`sql`${state}``) turns it into a placeholder, and drizzle-kit then writes
 * the literal text `$1` into the migration file — producing a CHECK constraint
 * that does not mean what the schema says. The values here are compile-time
 * constants from this package's own state tuples, and quotes are escaped
 * regardless so a literal can never terminate the string early.
 */
function sqlLiteral(value: string) {
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

/**
 * Builds `column in ('a','b',...)` from the canonical state tuple.
 *
 * ```ts
 * check('ck_orders__status', stateCheck(t.status, ORDER_STATES))
 * ```
 */
export function stateCheck(column: AnyPgColumn, states: readonly string[]) {
  const values = sql.join(states.map(sqlLiteral), sql`, `);
  return sql`${column} in (${values})`;
}

/**
 * Builds `column in (...)` for a subset — the shape partial-index predicates
 * take for "non-terminal" or "claimable" state sets.
 *
 * The predicate must reference only immutable expressions: PostgreSQL rejects
 * `now()` in an index predicate outright, which is why expiry indexes key on
 * `expires_at` under a *state* predicate and leave `now()` to the query
 * (DB5-A03).
 */
export function stateInCheck(column: AnyPgColumn, states: readonly string[]) {
  return stateCheck(column, states);
}
