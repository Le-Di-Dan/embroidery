/**
 * The Docker-only public catalog-media suites (`APP2-T01` §17/§21).
 *
 * They start a pinned MinIO container and a disposable PostgreSQL database per
 * run, so they are excluded from `pnpm test` and `pnpm quality`, which must
 * stay Docker-free. Run them explicitly:
 *
 *   pnpm test:public-media:integration
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/public-media*.spec.ts'],
  // Container start plus 33 migrations far exceeds the default; the timeout has
  // to cover setup, not just an assertion.
  testTimeout: 300_000,
  // One disposable MinIO container and one database per suite: serial, so a
  // slow container start is never mistaken for a failure.
  maxWorkers: 1,
  transform: {
    '^.+[.]ts$': ['ts-jest', {}],
  },
};
