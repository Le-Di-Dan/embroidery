/**
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED` — the **one** server-side release-control
 * variable for the Wave-2 custom embroidery capability (`APP12-G02`).
 *
 * ## One capability, one authority
 *
 * `APP12-RELEASE-WAVE-AUTHORITY.md` §4 splits the delivered product into two
 * release waves: `WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE` plus the
 * shared primitives, public content and staff operations it needs, and
 * `WAVE 2 = ALL CUSTOM EMBROIDERY`. Every custom customer entry point is built
 * and every one of them is reachable today; nothing in the repository withholds
 * anything, which is why this variable exists.
 *
 * It is exactly **one** variable, deliberately. `IMP-D050` records what happens
 * when four lookalike names coexist for one idea: an operator changes the one
 * they can find and the system keeps behaving as though they had not. There is
 * no `ENABLE_EDITOR`, no `ENABLE_CUSTOM_REQUESTS`, no `CUSTOM_FLOW_ENABLED` and
 * no per-surface alias. The Design Studio, custom request intake, quotation,
 * design review, custom payment and the custom fulfilment surfaces are one
 * release decision, so they read one name.
 *
 * ## Non-secret, server-side
 *
 * `CLAUDE.md` §8a protects any variable whose name contains `PASSWORD`,
 * `PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL` or `PRIVATE`. This name
 * contains none of them, deliberately: it carries no credential and its value is
 * inferable by any visitor who requests a withheld route. It is still read
 * **server-side only** and has no `NEXT_PUBLIC_` twin in either application — a
 * release gate a browser can read is a release gate a browser can be told to
 * ignore, and the value must never be the client's to decide.
 *
 * ## Fail closed, in both directions
 *
 * Wave 2 is withheld unless the configuration says, exactly and unambiguously,
 * that it is released:
 *
 * ```text
 * "true"    -> enabled
 * "false"   -> withheld
 * missing   -> withheld
 * empty     -> withheld
 * anything  -> withheld   (fail closed)
 * ```
 *
 * Only lowercase `true` is accepted. `1`, `yes`, `on` and `TRUE` are **not**
 * true here: no repository-wide boolean convention establishes them (the one
 * delivered precedent, `parseDocsEnabled` in `app-config.ts`, accepts exactly
 * `"true"`/`"false"` and nothing else), and a gate that guesses at an operator's
 * intent is a gate that can be opened by a typo.
 *
 * ### Why an invalid value returns `false` rather than throwing
 *
 * `parseDocsEnabled` throws on an unrecognised value, and for a Swagger-UI
 * toggle that is right: refusing to start is strictly safer than serving docs by
 * accident. Here the same choice would be unsafe in the other direction. This
 * process serves the **released Wave-1** business — the public catalog, the
 * gallery, contact verification, Ready-Made commerce — and a typo in a variable
 * that governs an *unreleased* capability must not take the released shop down
 * with it. Refusing the withheld capability is the fail-closed outcome; refusing
 * to boot is an outage. `APP12-RELEASE-WAVE-AUTHORITY.md` §4 rule 1 asks for the
 * former: "An unrecognized or unset release configuration withholds Wave 2."
 *
 * The Storefront's `config/custom-embroidery-release.ts` implements this exact
 * table. The two applications are separate runtimes with separate configuration
 * layers and separate container images, and neither can import the other's
 * module; the semantic contract is the same and each side proves the same five
 * cases in its own suite.
 */

/** The one variable name. Written once so a typo is a compile-time rename. */
export const CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';

/** Injection token for the resolved release state. */
export const CUSTOM_EMBROIDERY_RELEASE_CONFIG = Symbol('CUSTOM_EMBROIDERY_RELEASE_CONFIG');

/** The only value that releases Wave 2. */
const ENABLED_VALUE = 'true';

export interface CustomEmbroideryReleaseConfig {
  /** `true` only when the variable is exactly `"true"`. */
  readonly enabled: boolean;
  /**
   * `true` when a value was present but was neither `"true"` nor `"false"`.
   *
   * Carried so the startup log can tell an operator that their configuration was
   * not understood. Without it a typo is indistinguishable from a deliberate
   * `false`, and the operator's next move — turning the capability on — would
   * silently keep failing.
   */
  readonly malformed: boolean;
}

/**
 * The variable bag this reads. Deliberately narrower than `NodeJS.ProcessEnv`
 * so a test can pass a bag containing only this one name.
 */
export type CustomEmbroideryReleaseEnv = Readonly<Record<string, string | undefined>>;

/**
 * Resolves the release state. Never throws: see the note above on why an outage
 * is not the fail-closed outcome for an unreleased capability.
 *
 * The raw value is never echoed. It is not a secret, but a validator that
 * printed its input would be the wrong habit to establish beside the ones that
 * must not.
 */
export function loadCustomEmbroideryReleaseConfig(
  env: CustomEmbroideryReleaseEnv,
): CustomEmbroideryReleaseConfig {
  const raw = env[CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV];
  if (raw === undefined || raw === '') {
    return { enabled: false, malformed: false };
  }
  if (raw === ENABLED_VALUE) {
    return { enabled: true, malformed: false };
  }
  if (raw === 'false') {
    return { enabled: false, malformed: false };
  }
  return { enabled: false, malformed: true };
}
