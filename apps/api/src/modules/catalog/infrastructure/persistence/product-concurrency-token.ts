/**
 * The accepted Product concurrency-token mechanism (`APP2-B02-C1`).
 *
 * Extracted so every guarded Product write — draft update, archive, publish and
 * unpublish — advances the token the *same* way. A second copy is how one
 * operation quietly starts publishing a token another operation can reuse, and
 * that is precisely the defect C1 was raised to fix.
 */
import { schema } from '@embroidery/database';
import { eq, sql } from 'drizzle-orm';

const { products } = schema;

/**
 * The concurrency guard, compared at millisecond precision.
 *
 * `timestamptz` keeps microseconds, but the token the client receives is an ISO
 * string with milliseconds — so a caller can only ever echo back a truncated
 * value. Comparing the raw column would make every guarded write fail against a
 * row whose `updated_at` came from the database default. Truncating both sides
 * compares exactly what the client was given.
 */
export function updatedAtMatches(expected: Date) {
  return eq(sql`date_trunc('milliseconds', ${products.updatedAt})`, expected);
}

/**
 * The next concurrency token — **strictly greater** than the current one.
 *
 * Truncating to milliseconds made the token comparable, but not yet safe: two
 * mutations landing inside the same millisecond would publish the *same* token,
 * and the second caller's "stale" value would then still match. A token that
 * can repeat is not a concurrency token.
 *
 * So the new value is the later of the current clock and one millisecond past
 * the row's own token. It is computed by the database inside the same statement
 * — `clock_timestamp()` rather than `now()`, because `now()` is fixed for the
 * whole transaction and two writes in one transaction would tie again — and
 * application time is never the authority: a skewed API host must not be able
 * to issue a token that moves backwards.
 */
export function nextUpdatedAt() {
  return sql`greatest(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', ${products.updatedAt}) + interval '1 millisecond'
  )`;
}
