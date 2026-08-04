/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Integration suites create a database and apply 31 migrations before the
  // first assertion; the 5s default would fail on setup, not on behaviour.
  testTimeout: 300_000,
  // Suites that need something built before they can run: `worker-smoke` needs
  // `dist/`, while `worker-signal-smoke` and the FD1 `.process.spec` build
  // Docker images. `turbo run test` builds dependencies but not the package
  // under test, so leaving any of them here would make them pass or fail
  // depending on what happened to be on disk. Each runs from its own script,
  // which sets up what it needs first.
  // The APP2-I03 storage-bootstrap suites join the list for the same reason:
  // they start a MinIO container and a built process, so they run from their
  // own scripts (`test:storage-bootstrap:worker`, `:composition`), never from
  // the Docker-free `pnpm test`.
  // The APP2-W01 asset-processing integration suites join for the same reason:
  // each one starts a MinIO container and a disposable PostgreSQL, so they run
  // from `test:asset-processing:integration`, never from the Docker-free
  // `pnpm test`. Their Docker-free unit siblings sit next to the code and do
  // run here.
  testPathIgnorePatterns: [
    '\\\\node_modules\\\\',
    '/node_modules/',
    'worker-smoke',
    'worker-signal-smoke',
    'storage-bootstrap-worker',
    'storage-bootstrap-composition',
    'asset-inspection-.*\\.integration',
    // The APP3-W01A normalization suites join for the same reason: each starts a
    // MinIO container and a disposable PostgreSQL, so they run from the indexed
    // `CMD-TEST-APP3-W01A-INTEGRATION`, never from the Docker-free `pnpm test`.
    // Their Docker-free unit siblings sit next to the code and do run here.
    'asset-normalization.*\\.integration',
    'asset-processing-worker\\.smoke',
    '\\.process\\.spec\\.ts$',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
