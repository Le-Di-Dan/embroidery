/**
 * Between-test isolation for the DB7 integration suites.
 *
 * `TRUNCATE` rather than `DELETE`: the 30 S24 triggers are row-level
 * `BEFORE UPDATE OR DELETE` guards and would reject a `DELETE` on every
 * append-only and immutable table — correctly, since that is their whole
 * purpose. `TRUNCATE` does not fire row-level triggers, so a test can reset
 * state without the suite having to disable the very guards it is testing.
 *
 * The migration-history schema is excluded: dropping it would make the database
 * look unmigrated to the next check.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { Database } from '../client/create-database-client';
import type { Transaction } from '../client/transaction';

/**
 * Empties every table in `public` in one statement.
 *
 * One `TRUNCATE` over all tables (rather than one per table) is both faster and
 * necessary: `CASCADE` on separate statements would fight the FK graph, while a
 * single multi-table truncate satisfies it atomically.
 */
export async function truncateAllTables(executor: Database | Transaction): Promise<void> {
  await executor.execute(sql`
    do $$
    declare
      v_tables text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ')
        into v_tables
        from pg_tables
       where schemaname = 'public';

      if v_tables is not null then
        execute 'truncate table ' || v_tables || ' restart identity cascade';
      end if;
    end $$;
  `);
}
