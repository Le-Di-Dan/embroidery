/**
 * The Docker-only asset-intake suites (APP2-B01 §25/§26).
 *
 * They start a pinned MinIO container and a disposable PostgreSQL database per
 * run, so they are deliberately excluded from `pnpm test` and `pnpm quality`,
 * which must stay Docker-free. Run them explicitly:
 *
 *   pnpm test:asset-intake:integration
 *   pnpm test:asset-intake:api
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/asset-intake*.spec.ts'],
  // Pulling and starting MinIO plus applying 31 migrations far exceeds the
  // default; the timeout must cover container setup, not just an assertion.
  testTimeout: 300_000,
  // One disposable MinIO container and one database per worker: these suites
  // run serially so a slow container start cannot be mistaken for a failure.
  maxWorkers: 1,
  transform: {
    '^.+[.]ts$': ['ts-jest', {}],
  },
};
