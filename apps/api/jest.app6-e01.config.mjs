/**
 * The `APP6-E01` focused cross-layer acceptance run.
 *
 * A dedicated config rather than a filter on the default one, for two reasons
 * the checkpoint requires:
 *
 * 1. **Serial.** `maxWorkers: 1` — the six cases are one ordered acceptance
 *    package, and a failure has to name the case that broke without another
 *    case's output interleaved with it.
 * 2. **Scoped.** `testMatch` names only `test/acceptance/app6-e01`, so this
 *    command can never become a repository-wide aggregate
 *    (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no `B0n`, `A0n` or `S0n`
 *    suite.
 *
 * Each case provisions its own disposable database and applies every migration
 * before its first assertion, so the timeout is generous by necessity rather
 * than by habit.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app6-e01'],
  testMatch: ['<rootDir>/test/acceptance/app6-e01/**/*.acceptance.spec.ts'],
  testTimeout: 300_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
