/**
 * The `APP9-E01` focused cross-boundary acceptance run — API side.
 *
 * A dedicated config rather than a filter on the default one, for the two
 * reasons `jest.app8-e01.config.mjs` records and this checkpoint restates:
 *
 * 1. **Serial.** `maxWorkers: 1` — the journeys are one ordered acceptance
 *    package running against a single order, and a failure has to name the case
 *    that broke without another journey's output interleaved with it.
 * 2. **Scoped.** `testMatch` names only `test/acceptance/app9-e01`, so this
 *    command can never become a repository-wide aggregate
 *    (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no `B0n` suite.
 *
 * The worker half of `APP9-E01` (journey `2B`, the verified `REMAINING` balance
 * reaching the reservation consumer) runs from
 * `apps/worker/jest.app9-e01.config.mjs`, because `apps/api` may not import
 * `apps/worker`.
 *
 * The suite provisions its own disposable database and applies every migration
 * before its first assertion, so the timeout is generous by necessity.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app9-e01'],
  testMatch: ['<rootDir>/test/acceptance/app9-e01/**/*.acceptance.spec.ts'],
  testTimeout: 300_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
