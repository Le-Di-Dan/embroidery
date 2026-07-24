/**
 * Node-side unit tests for the engine-neutral layer (document model, canonical
 * form, hashing, validation, scenes, units, watermark policy). Browser-side
 * behaviour is covered by the Playwright bench tier, never here.
 *
 * `ts-jest` rather than `next/jest`: nothing under test imports Next, and
 * `next/jest` needs an app directory (same reasoning as APP0-T02A deviation D-1).
 */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/document/**/*.ts', 'src/harness/watermark.ts'],
};
