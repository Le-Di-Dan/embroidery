/**
 * The `APP8-E01` focused cross-boundary acceptance run — worker side.
 *
 * Journey `J2` only: `payment.verified` -> the order's official reservation,
 * driven through the real worker runtime. It lives in its own config for the
 * two reasons the API half records — **serial**, because `runOnce` claims from
 * the whole queue and interleaved cases would make "whose job ran?"
 * unanswerable; and **scoped**, so this command can never become a
 * repository-wide aggregate (`VALIDATION_GOVERNANCE.md` §1.1). It reruns no
 * `APP8-W01` suite.
 *
 * The API journeys `J1`, `J3` and `J4` run from
 * `apps/api/jest.app8-e01.config.mjs`, because `apps/api` may not import
 * `apps/worker`.
 *
 * ### Why it extends the default config rather than restating it
 *
 * The harness compiles the whole `WorkerModule`, which reaches the APP3-W01B
 * SVG sanitizer and through it jsdom's ESM-only dependency closure. The
 * `transformIgnorePatterns` exception that makes those loadable is maintained in
 * `jest.config.mjs`, and copying it here would create a second list free to
 * drift from the first. Only the three acceptance-specific keys are overridden.
 *
 * The suite provisions a disposable database and applies every migration before
 * its first assertion, so the timeout stays the base config's generous one.
 *
 * @type {import('jest').Config}
 */
import base from './jest.config.mjs';

export default {
  ...base,
  rootDir: '.',
  roots: ['<rootDir>/test/acceptance/app8-e01'],
  testMatch: ['<rootDir>/test/acceptance/app8-e01/**/*.acceptance.spec.ts'],
  maxWorkers: 1,
};
