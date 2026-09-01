/**
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED` — the Storefront's read of the **one**
 * server-side release-control variable for the Wave-2 custom embroidery
 * capability (`APP12-G02`).
 *
 * ## The same variable the API reads, meaning the same thing
 *
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §4 requires the release decision at the
 * route level **and** the API level, enforced independently: "a blocked route
 * with a live API is not blocked." Two enforcement points, one decision — so
 * both processes read the identical name and apply the identical table:
 *
 * ```text
 * "true"    -> enabled
 * "false"   -> withheld
 * missing   -> withheld
 * empty     -> withheld
 * anything  -> withheld   (fail closed)
 * ```
 *
 * Only lowercase `true` releases the capability. `1`, `yes`, `on` and `TRUE` are
 * not accepted: no repository-wide boolean convention establishes them, and a
 * gate that guesses at an operator's intent is a gate a typo can open.
 *
 * ## Why the parser is written here and not shared
 *
 * The natural home for one semantic contract read by two applications would be a
 * workspace package. It cannot be one at this checkpoint, for a concrete reason
 * rather than a stylistic one: the development Storefront container bind-mounts
 * `packages/contracts/src`, and the API container bind-mounts only
 * `apps/api/src`. A shared package would therefore reach one runtime and not the
 * other without rebuilding the API image, and `APP12-G02` may not rebuild an
 * image (image reproducibility is `APP12-H02`'s). Each application validates the
 * variable in its own configuration layer, exactly as `STOREFRONT_PUBLIC_ORIGIN`
 * is validated separately by the worker and by this app; the contract is one, and
 * each side proves the same five cases in its own suite.
 *
 * ## Server-side, non-secret, and never the client's decision
 *
 * No `NEXT_PUBLIC_` twin exists. A release gate the browser can read is a gate
 * the browser can be told to ignore, and `APP12-RELEASE-WAVE-AUTHORITY.md` §4
 * forbids a navigation-only or JavaScript-only control. The name carries none of
 * the `CLAUDE.md` §8a secret markers and holds no credential.
 *
 * The value is read through a bracket lookup on a named constant rather than as
 * a literal `process.env.CUSTOM_EMBROIDERY_RELEASE_ENABLED` expression. That is
 * the delivered `public-origin.ts` pattern and it matters here: a literal
 * member access is the shape a bundler can inline at build time, which would
 * turn a configuration-driven gate into build-time dead code — precisely what §4
 * rules out.
 */

/** The one variable name. Written once so a typo is a compile-time rename. */
export const CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';

/** The only value that releases Wave 2. */
const ENABLED_VALUE = 'true';

/** The only value that explicitly withholds it. Anything else is malformed. */
const DISABLED_VALUE = 'false';

export interface CustomEmbroideryReleaseState {
  /** `true` only when the variable is exactly `"true"`. */
  readonly enabled: boolean;
  /**
   * `true` when a value was present but was neither `"true"` nor `"false"`.
   *
   * Carried so a malformed value is distinguishable from a deliberate `false`.
   * Without it, an operator who typed `True` would keep turning the capability
   * on and keep watching nothing happen.
   */
  readonly malformed: boolean;
}

/**
 * The variable bag this reads. Deliberately narrower than `NodeJS.ProcessEnv`,
 * which Next augments with required keys of its own, so a test can pass a bag
 * containing only this one name.
 */
export type CustomEmbroideryReleaseEnv = Readonly<Record<string, string | undefined>>;

/**
 * Resolves the release state. Never throws.
 *
 * A throw would be the wrong kind of fail-closed. This process serves the
 * released Wave-1 storefront — the public catalog, the gallery, the content
 * pages, contact verification — and a typo in a variable governing an
 * *unreleased* capability must not take the released shop down with it.
 * Withholding the capability is the fail-closed outcome; refusing to serve is an
 * outage. The raw value is never echoed.
 */
export function loadCustomEmbroideryRelease(
  env: CustomEmbroideryReleaseEnv,
): CustomEmbroideryReleaseState {
  const raw = env[CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV];
  if (raw === undefined || raw === '') {
    return { enabled: false, malformed: false };
  }
  if (raw === ENABLED_VALUE) {
    return { enabled: true, malformed: false };
  }
  if (raw === DISABLED_VALUE) {
    return { enabled: false, malformed: false };
  }
  return { enabled: false, malformed: true };
}

/**
 * Whether the Wave-2 custom embroidery capability is released in this process.
 *
 * Deliberately **not** memoized, on the delivered `public-origin.ts` reasoning: a
 * corrected configuration would otherwise need a restart to take effect while a
 * stale one kept being served. The work is one map lookup and three string
 * comparisons.
 */
export function isCustomEmbroideryReleased(): boolean {
  return loadCustomEmbroideryRelease(process.env).enabled;
}
