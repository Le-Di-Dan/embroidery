/**
 * The Docker-only Session-upload suite (`APP3-B06B-C1`).
 *
 * It starts a pinned MinIO container and a disposable PostgreSQL database per
 * run, so it is excluded from `pnpm test` and `pnpm quality`, which must stay
 * Docker-free — the same separation `jest.asset-intake.config.mjs` and
 * `jest.public-media.config.mjs` already make. Run it explicitly:
 *
 *   pnpm --filter @embroidery/api exec jest \
 *     --config jest.design-session-asset.config.mjs
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/design-session-asset*.spec.ts'],
  // Container start plus every migration far exceeds the default; the timeout
  // has to cover setup, not just an assertion.
  testTimeout: 300_000,
  // One disposable MinIO container and one database for the suite: serial, so a
  // slow container start is never mistaken for a failure.
  maxWorkers: 1,
  transform: {
    '^.+[.]ts$': ['ts-jest', {}],
  },
};
