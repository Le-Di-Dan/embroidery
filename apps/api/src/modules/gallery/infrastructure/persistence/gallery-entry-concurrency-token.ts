/**
 * The Gallery-entry concurrency-token mechanism (`APP11-B02` §6).
 *
 * A local copy of the accepted Product mechanism (`product-concurrency-token.ts`,
 * `APP2-B02-C1`) rather than an import of it: those helpers are bound to the
 * `products` table by construction — the SQL names the column — so sharing them
 * would mean a Gallery write comparing a Product's `updated_at`. The *rule* is
 * shared, and it is stated once here so every guarded Gallery write — the
 * authoring patch, the media replacement, publish and unpublish — advances the
 * token the same way.
 */
import { schema } from '@embroidery/database';
import { eq, sql } from 'drizzle-orm';

const { galleryEntries } = schema;

/**
 * The concurrency guard, compared at millisecond precision.
 *
 * `timestamptz` keeps microseconds, but the token a client receives is an ISO
 * string with milliseconds — so a caller can only ever echo back a truncated
 * value. Comparing the raw column would make every guarded write fail against a
 * row whose `updated_at` came from the database default; truncating both sides
 * compares exactly what the client was given.
 */
export function updatedAtMatches(expected: Date) {
  return eq(sql`date_trunc('milliseconds', ${galleryEntries.updatedAt})`, expected);
}

/**
 * The next token — **strictly greater** than the current one.
 *
 * Truncating to milliseconds made the token comparable, but not yet safe: two
 * mutations landing inside the same millisecond would publish the *same* token,
 * and the second caller's stale value would then still match. A token that can
 * repeat is not a concurrency token.
 *
 * So the new value is the later of the current clock and one millisecond past
 * the row's own token, computed by the database inside the same statement —
 * `clock_timestamp()` rather than `now()`, which is fixed for the whole
 * transaction and would let two writes in one transaction tie again. Application
 * time is never the authority: a skewed API host must not be able to issue a
 * token that moves backwards.
 */
export function nextUpdatedAt() {
  return sql`greatest(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', ${galleryEntries.updatedAt}) + interval '1 millisecond'
  )`;
}

/** The token as it is published: truncated to the precision clients receive. */
export function publishedUpdatedAt() {
  return sql<Date>`date_trunc('milliseconds', ${galleryEntries.updatedAt})`;
}
