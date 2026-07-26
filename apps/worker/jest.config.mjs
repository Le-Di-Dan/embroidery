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
  testPathIgnorePatterns: [
    '\\\\node_modules\\\\',
    '/node_modules/',
    'worker-smoke',
    'worker-signal-smoke',
    '\\.process\\.spec\\.ts$',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
