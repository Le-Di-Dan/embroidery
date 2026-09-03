/**
 * The `APP10-E01` focused cross-boundary acceptance run — API side.
 *
 * A dedicated config rather than a filter on the default one, for the two
 * reasons `jest.app9-e01.config.mjs` records and this checkpoint restates:
 *
 * 1. **Serial.** `maxWorkers: 1` — journeys `J1`, `J2` and `J4-C1` are one
 *    ordered acceptance package walking a single pair of Customers from
 *    resolution to an executed merge, and a failure has to name the case that
 *    broke without another journey's output interleaved with it.
 * 2. **Scoped.** `testMatch` names only `test/acceptance/app10-e01`, so this
 *    command can never become a repository-wide aggregate
 *    (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no `B0n`/`A0n` suite.
 *
 * The Admin frontend half of `J1-C2` and the Storefront half of `J4-C2`/`J4-C3`
 * run from their own workspaces, because `apps/api` carries no jsdom component
 * stack and the boundary those cases prove is a rendered screen.
 *
 * Each suite provisions its own disposable database and applies every migration
 * before its first assertion, so the timeout is generous by necessity.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app10-e01'],
  testMatch: ['<rootDir>/test/acceptance/app10-e01/**/*.acceptance.spec.ts'],
  testTimeout: 300_000,
  maxWorkers: 1,
  transform: {
    // The key is a regex *source string*, so the dot needs a real escaped
    // backslash. `'\.'` in a JS string is just `.`, which made the pattern
    // `^.+.ts$` — matching `foo.ts`, but also `fooXts`. Closed by `APP12-H01`
    // (FU-APP12-S03-C1-03); the intent was always a literal dot.
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
