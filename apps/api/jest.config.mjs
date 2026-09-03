import { WAVE2_IGNORE_PATTERNS } from './test/support/wave2-suites.mjs';

/**
 * The DEFAULT (Wave-1) API harness.
 *
 * It sets `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` explicitly and excludes the
 * Wave-2 suites, which run under `jest.wave2.config.mjs` with the flag `true`.
 * Before `APP12-H02` neither harness set the variable at all, so 15 suites
 * failed with `404` under a clean environment and passed under a developer's
 * (`FU-APP12-B02-03`).
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  // Runs before the test framework, so the flag is set before any suite composes
  // a Nest module and reads it.
  setupFiles: ['<rootDir>/test/support/release-flag.wave1.mjs'],
  // `test/` holds application-integration suites kept out of the production
  // source tree (`src/`) so they can never be compiled or copied into `dist`.
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Integration suites create a database and apply 31 migrations before the
  // first assertion; the 5s default would fail on setup, not on behaviour.
  testTimeout: 120_000,
  // The DB-integration and durability suites all share one dev PostgreSQL
  // container (APP0-T01). Unbounded worker parallelism saturates it — slow
  // `docker exec` teardowns then time out — so peak concurrency is capped.
  // Disposable databases are pid-scoped, so bounded parallel workers stay
  // isolated; this enforces a concurrency policy, it does not serialise.
  maxWorkers: '50%',
  // The asset-intake, public-media and Session-upload suites need a Docker
  // daemon (disposable MinIO), and `pnpm test` / `pnpm quality` must stay
  // Docker-free. They have their own configs and their own explicit scripts.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/test/integration/asset-intake',
    '<rootDir>/test/integration/public-media',
    '<rootDir>/test/integration/design-session-asset',
    // The Wave-2 suites. They need the capability released and this harness
    // withholds it, so they run under `jest.wave2.config.mjs` instead. The list
    // is shared with that config rather than restated here.
    ...WAVE2_IGNORE_PATTERNS,
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
