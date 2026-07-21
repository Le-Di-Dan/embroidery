/**
 * Deterministic, time-ordered UUID generation inside PostgreSQL (DB9-CP1).
 *
 * Bulk dataset generation happens in SQL — one `INSERT … SELECT … FROM
 * generate_series` per table rather than a round-trip per row (§23) — so the
 * ids have to be derivable in SQL too. A plain `md5(...)::uuid` would be
 * deterministic but *random-ordered*, which would scatter B-tree page writes
 * and quietly misrepresent every index-size and write-amplification number
 * DB9 goes on to measure. Production ids are UUIDv7 (`identifiers.ts`), so
 * the generator emits the same shape: a millisecond timestamp prefix, the
 * version-7 nibble, the RFC 9562 variant bits, and a seed-derived tail.
 *
 * Same seed and same index ⇒ same uuid, on any machine.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { PlanRunner } from './bench-plan';

/**
 * Fixed epoch so a regenerated dataset is byte-identical across machines.
 *
 * Interpolated with `sql.raw` rather than bound: a bind parameter inside a
 * `CREATE FUNCTION` body would be a parameter of the `CREATE`, not of the
 * function. The value is a module-level numeric literal, never caller input.
 */
const BENCH_EPOCH_MS = 1_700_000_000_000;

/**
 * Installs `bench_uuid(seed text, n bigint)` into the benchmark database.
 *
 * Lives only in disposable benchmark databases — it is never part of a
 * migration and never reaches the persistent development database.
 */
export async function installBenchUuid(runner: PlanRunner): Promise<void> {
  await runner.execute(sql`
    create or replace function bench_uuid(seed text, n bigint)
    returns uuid
    language sql
    immutable
    as $$
      select (
        lpad(to_hex(${sql.raw(String(BENCH_EPOCH_MS))}::bigint + n), 12, '0')
        || '7'
        || substr(md5(seed || ':' || n::text), 1, 3)
        || to_hex(8 + (n % 4))
        || substr(md5(seed || ':' || n::text), 4, 3)
        || substr(md5(seed || ':' || n::text), 7, 12)
      )::uuid
    $$;
  `);
}
