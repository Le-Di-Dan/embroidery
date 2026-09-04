/**
 * Docker-free unit suite for the metrics platform (`APP12-H03` §25).
 *
 * Everything in this package is pure: a registry, a contract and a text
 * renderer. There is nothing to stand up, so the suite is fast enough to run on
 * every change to the cardinality contract, which is the point — the contract
 * is only a guarantee if breaking it is a red test.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', moduleResolution: 'Node' } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageReporters: ['text', 'lcov'],
};
