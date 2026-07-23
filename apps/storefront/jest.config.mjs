import nextJest from 'next/jest.js';

// Locked component-test transform (IMP-D024): next/jest applies the Next SWC
// transform and auto-handles SCSS/image/next-font/.env/aliases for this app.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  // Default environment for component/client tests. Server-only test files
  // opt into Node via a `@jest-environment node` docblock.
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  roots: ['<rootDir>/test'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/test/'],
  coverageReporters: ['text', 'lcov'],
};

export default createJestConfig(config);
