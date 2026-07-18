/**
 * Timestamp primitives (ADR-DB1-006, DB6-S04).
 *
 * Every instant is `timestamptz` in UTC. Date-only business concepts would use
 * `date` with an `_on` suffix; none exists yet.
 *
 * `updated_at` is intentionally *not* offered as a default: ADR-DB1-006 forbids
 * it on append-only and immutable tables, so each table opts in explicitly
 * rather than inheriting a column that contradicts its own immutability.
 */
import { timestamp } from 'drizzle-orm/pg-core';

/** A UTC instant. */
export function instant(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}

/** Creation instant: NOT NULL, defaulted by the database. */
export function createdAt(name = 'created_at') {
  return instant(name).notNull().defaultNow();
}

/**
 * Last-modification instant for mutable tables only.
 * Never add this to an append-only or immutable table.
 */
export function updatedAt(name = 'updated_at') {
  return instant(name).notNull().defaultNow();
}
