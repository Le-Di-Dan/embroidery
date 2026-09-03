/**
 * The Wave-2 harness: the release flag is set **explicitly** to `true`
 * (`APP12-H02` continuation §7 — `FU-APP12-B02-03`).
 *
 * Scoped to the suites in `wave2-suites.mjs` and to nothing else. Wave 2 is not
 * released, and a test run that turned it on globally would hand 28 withheld
 * public operations to every suite in the API — including the ones whose whole
 * purpose is to prove those operations stay withheld. Those suites would then
 * pass or fail for reasons that have nothing to do with the code under test.
 *
 * This file releases the capability for the process that runs the custom
 * embroidery journeys, and the default harness (`release-flag.wave1.mjs`) keeps
 * it withheld everywhere else.
 */
process.env['CUSTOM_EMBROIDERY_RELEASE_ENABLED'] = 'true';
