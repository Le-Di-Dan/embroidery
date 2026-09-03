import base from './jest.config.mjs';
import { WAVE2_SUITE_PATHS } from './test/support/wave2-suites.mjs';

/**
 * The WAVE-2 API harness (`APP12-H02` continuation §7 — `FU-APP12-B02-03`).
 *
 * Runs **only** the suites that exercise Wave-2 public custom-embroidery
 * surfaces, with `CUSTOM_EMBROIDERY_RELEASE_ENABLED=true` set explicitly.
 *
 * A separate config rather than a flag on the default run, because the two
 * harnesses need opposite values of the same variable in the same process. Jest
 * sets `setupFiles` per project, so one process cannot hold both — and running
 * everything with `true` would release 28 withheld operations to the suites
 * whose job is to prove they stay withheld.
 *
 * The suite list is imported from the same module the default config uses to
 * exclude them, so the two harnesses cannot disagree about which files are
 * Wave-2. Adding a file to one is removing it from the other.
 *
 * @type {import('jest').Config}
 */
export default {
  ...base,
  setupFiles: ['<rootDir>/test/support/release-flag.wave2.mjs'],
  // Exactly these files. `testPathIgnorePatterns` is reset to the framework
  // default so the base config's Wave-2 exclusions do not cancel this list out.
  roots: ['<rootDir>/test'],
  testMatch: WAVE2_SUITE_PATHS.map((path) => `<rootDir>/${path}`),
  testPathIgnorePatterns: ['/node_modules/'],
};
