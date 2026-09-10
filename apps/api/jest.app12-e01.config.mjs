/**
 * The `APP12-E01` Wave-1 commerce regression run — API side.
 *
 * A dedicated config rather than a filter on the default one, for the two
 * reasons `jest.app10-e01.config.mjs` records and this checkpoint restates:
 *
 * 1. **Serial.** `maxWorkers: 1` — the journeys are one ordered regression
 *    package, several of them start the real reservation-expiry sweep in its own
 *    process, and a failure has to name the case that broke without another
 *    journey's worker output interleaved with it. Two suites racing the same
 *    sweep would also make a timing assertion mean nothing.
 * 2. **Scoped.** `testMatch` names only `test/acceptance/app12-e01`, so this
 *    command can never become a repository-wide aggregate
 *    (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no `B0n`/`A0n`/`S0n` suite:
 *    `APP12-B02`'s oversell race, `APP12-B03`'s concurrent fee writes,
 *    `APP12-B03-C1`'s sweep orderings and `APP12-B05`'s verification races all
 *    stay where they are and are run from their own indexed commands.
 *
 * The browser half of the regression — the positive lifecycle in Chromium, the
 * U01 F1–F4 screen truth, checkout CSP, the `PAYMENT_UNDER_REVIEW` accessibility
 * scan and the SEO/public reads — runs from `@embroidery/e2e-testing`, because
 * the facts it proves are transport, rendering and layout facts this workspace
 * cannot observe.
 *
 * Each suite provisions its own disposable database and applies every migration
 * before its first assertion, so the timeout is generous by necessity.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app12-e01'],
  testMatch: ['<rootDir>/test/acceptance/app12-e01/**/*.acceptance.spec.ts'],
  testTimeout: 600_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
