/**
 * Driving `CUSTOM_EMBROIDERY_RELEASE_ENABLED` inside a suite (`APP12-G02-C1`).
 *
 * The Storefront reads the release flag from `process.env` on every call —
 * deliberately unmemoized, so a corrected value takes effect without a restart
 * (`src/config/custom-embroidery-release.ts`). That makes both halves of the
 * suppression testable in one process: render with the capability withheld,
 * render again with it released, and compare.
 *
 * Written once here because five suites need it and each hand-rolled
 * save/restore is a chance to leak the variable into the next test file. The
 * restore runs in a `finally`, so a failing assertion still leaves the process
 * as it found it — including the case where the variable was absent, which is
 * not the same as it being `'false'` and must be put back as absence.
 */
const KEY = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';

/**
 * Runs `body` with the capability released (`true`) or withheld (`false`), then
 * restores the previous value. Synchronous on purpose: every caller renders a
 * Server Component tree, and an `await` inside would let a second test observe
 * the mutated variable.
 */
export function withCustomEmbroideryRelease<T>(released: boolean, body: () => T): T {
  const previous = process.env[KEY];
  process.env[KEY] = released ? 'true' : 'false';
  try {
    return body();
  } finally {
    if (previous === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = previous;
    }
  }
}
