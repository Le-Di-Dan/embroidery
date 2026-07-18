import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration (ADR-DB1-003/004/005).
 *
 * - one linear migration history, committed to Git, immutable once shared;
 * - application tables live in `public` only; the tool's history table is
 *   isolated in its own `drizzle` schema (an infrastructure exception, not an
 *   application schema);
 * - `casing: 'snake_case'` so TypeScript property names map to the snake_case
 *   physical names required by ADR-DB1-006.
 *
 * `push` is deliberately never used: schema changes reach a database only
 * through a reviewed migration file.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  schemaFilter: ['public'],
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  strict: true,
  verbose: true,
});
