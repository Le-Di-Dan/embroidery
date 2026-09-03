/**
 * The suites that exercise **Wave-2** public custom-embroidery surfaces
 * (`APP12-H02` continuation §7 — `FU-APP12-B02-03`).
 *
 * ## Why this list exists at all
 *
 * `APP12-G02` put a release gate in front of 28 public operations. Every suite
 * below drives at least one of them, so under the Wave-1 default they answer
 * `404` and fail — not because the behaviour they assert is broken, but because
 * the capability is withheld. Before this file, no harness set the variable at
 * all, so the outcome depended on whatever happened to be in the developer's
 * environment: `FU-APP12-B02-03`.
 *
 * The fix is not "turn Wave 2 on for the test run". That would release 28
 * withheld operations to every suite, including the ones whose whole job is to
 * prove they stay withheld. It is two harnesses:
 *
 * - the default harness sets the flag to `false` **explicitly** and skips these
 *   files (`jest.config.mjs`);
 * - a Wave-2 harness sets it to `true` and runs **only** these files
 *   (`jest.wave2.config.mjs`).
 *
 * Neither inherits an ambient value.
 *
 * ## How the membership was decided
 *
 * Measured, not reasoned about. The whole `test/` tree was run twice — once with
 * the flag explicitly `false`, once explicitly `true` — and the difference is
 * exactly this list: 18 suites fail under `false`, 3 of those still fail under
 * `true` for unrelated pre-existing reasons, and the remaining 15 pass. A suite
 * belongs here when the flag is the only thing standing between it and green.
 *
 * `e01-06-contract-boundary` is the one judgement call: it is an `app6-e01`
 * COP-journey suite and belongs to Wave 2 by category, but it carries a separate
 * pre-existing failure that the flag does not fix. It is listed here because
 * where it belongs is a product fact, not a function of whether it currently
 * passes; its residual failure is recorded as inherited debt rather than hidden
 * by putting it in the other harness.
 *
 * A suite added here must be a suite that genuinely needs Wave 2 released. The
 * cost of a wrong entry is a test running with a capability it should not have.
 */

/**
 * Jest `testPathIgnorePatterns` / `testMatch` fragments, as POSIX-style path
 * suffixes. Written as paths rather than a directory prefix because the
 * `test/integration` directory holds Wave-1 suites too — `ready-made-order-*`,
 * `admin-*` — and a prefix rule would sweep those into the Wave-2 harness.
 */
export const WAVE2_SUITE_PATHS = Object.freeze([
  // APP5/APP6 — custom request intake and the COP journey.
  'test/integration/custom-request-submission.integration.spec.ts',
  'test/integration/custom-request-submission-races.integration.spec.ts',
  'test/integration/custom-request-submission-refusals.integration.spec.ts',
  'test/acceptance/app6-e01/e01-01-catalog-happy-path.acceptance.spec.ts',
  'test/acceptance/app6-e01/e01-02-cop-happy-path.acceptance.spec.ts',
  'test/acceptance/app6-e01/e01-03-quotation-negatives.acceptance.spec.ts',
  'test/acceptance/app6-e01/e01-04-design-negatives.acceptance.spec.ts',
  'test/acceptance/app6-e01/e01-05-secure-access.acceptance.spec.ts',
  'test/acceptance/app6-e01/e01-06-contract-boundary.acceptance.spec.ts',
  // APP3 — the Design Studio session and template surfaces.
  'test/integration/design-session-autosave.integration.spec.ts',
  'test/integration/design-session-bootstrap.integration.spec.ts',
  'test/integration/design-template-restore.integration.spec.ts',
  'test/integration/public-design-template.integration.spec.ts',
  'test/integration/public-template-asset-delivery.integration.spec.ts',
  'test/integration/public-template-asset-revocation.integration.spec.ts',
  // APP9 — the custom remaining-payment and fulfilment journey.
  'test/acceptance/app9-e01/app9-e01-journeys.acceptance.spec.ts',
]);

/** Anchored regular-expression sources for `testPathIgnorePatterns`. */
export const WAVE2_IGNORE_PATTERNS = WAVE2_SUITE_PATHS.map(
  (path) => `${path.replaceAll('/', '[\\\\/]').replaceAll('.', '\\.')}$`,
);
