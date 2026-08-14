/**
 * Docker-free unit suite for the delivery envelope.
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
