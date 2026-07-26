/**
 * Docker-free unit suite. Runs in `pnpm test` / `pnpm quality`.
 * The MinIO contract suite is deliberately NOT collected here — see
 * `jest.contract.config.mjs` and `pnpm test:object-storage:contract`.
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
