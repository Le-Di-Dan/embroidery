/**
 * Jest config for the orchestrator's plain-Node unit tests (IMP-D016 — Jest
 * stays the sole unit runner). Playwright is a separate browser tier and is
 * never launched by Jest. Only `support/**` orchestration helpers are unit
 * tested here; `specs/**` are Playwright specs and are excluded.
 *
 * The orchestrator is authored as native-ESM `.mjs` (plain Node, so it can run
 * outside ts-jest — see the runtime-loadability boundary), so its unit tests are
 * `.test.mjs` run under Jest's native ESM (no transform). Globals come from
 * `@jest/globals`.
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/support'],
  testMatch: ['**/*.test.mjs'],
  transform: {},
  collectCoverageFrom: ['support/**/*.mjs', '!support/**/*.test.mjs'],
  coverageReporters: ['text', 'lcov'],
};
