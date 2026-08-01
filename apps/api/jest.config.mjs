/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
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
  // The asset-intake and public-media suites need a Docker daemon (disposable
  // MinIO), and `pnpm test` / `pnpm quality` must stay Docker-free. They have
  // their own configs and their own explicit scripts.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/test/integration/asset-intake',
    '<rootDir>/test/integration/public-media',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
