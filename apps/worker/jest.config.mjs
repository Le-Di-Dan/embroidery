/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Integration suites create a database and apply 31 migrations before the
  // first assertion; the 5s default would fail on setup, not on behaviour.
  testTimeout: 300_000,
  // The smoke suite spawns the *built* `dist/main.js`, so it needs `build` to
  // have run first. `turbo run test` builds dependencies, not the package under
  // test, so leaving it here would make it pass or fail depending on whether a
  // stale `dist` happened to exist. It runs from `pnpm test:worker-runtime:smoke`
  // instead, which builds first.
  testPathIgnorePatterns: ['\\\\node_modules\\\\', '/node_modules/', 'worker-smoke'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
