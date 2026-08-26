/**
 * The `APP8-E01` focused cross-boundary acceptance run — API side.
 *
 * A dedicated config rather than a filter on the default one, for the two
 * reasons `jest.app6-e01.config.mjs` records and this checkpoint restates:
 *
 * 1. **Serial.** `maxWorkers: 1` — the journeys are one ordered acceptance
 *    package sharing a disposable database per file, and a failure has to name
 *    the case that broke without another journey's output interleaved with it.
 * 2. **Scoped.** `testMatch` names only `test/acceptance/app8-e01`, so this
 *    command can never become a repository-wide aggregate
 *    (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no `B0n` suite.
 *
 * The worker half of `APP8-E01` (journey `J2`, `payment.verified` -> official
 * reservation) runs from `apps/worker/jest.app8-e01.config.mjs`, because
 * `apps/api` may not import `apps/worker`.
 *
 * Each file provisions its own disposable database and applies every migration
 * before its first assertion, so the timeout is generous by necessity.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app8-e01'],
  testMatch: ['<rootDir>/test/acceptance/app8-e01/**/*.acceptance.spec.ts'],
  testTimeout: 300_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
