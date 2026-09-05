/**
 * The locale authority for every human-facing surface in the product.
 *
 * `APP12-V02` §5A makes the Vietnamese message repository the single place a
 * static sentence is written. That repository needs exactly one answer to "which
 * locale is this?", and this file is it — imported by both Next applications,
 * by the message loader and by the tests, so `<html lang>`, the next-intl
 * request configuration and the JSON directory on disk cannot disagree.
 *
 * The product is Vietnamese-only and stays that way in Wave 1. §5A of the
 * checkpoint prompt is explicit that i18n here is a *maintainability*
 * foundation, not a shipped language feature: there is no switcher, no locale
 * route segment and no browser negotiation. Those are recorded below as
 * constants rather than left as an absence, so a future change that wants one
 * has to change a declared decision instead of quietly adding a behaviour.
 */

/** The only locale the product currently renders. */
export const DEFAULT_LOCALE = 'vi';

/**
 * Every locale with a message directory. One entry today, and deliberately a
 * list: the loader and the tests iterate it, so adding a second locale is a
 * directory plus one entry rather than a search for hard-coded `'vi'`.
 */
export const SUPPORTED_LOCALES = [DEFAULT_LOCALE] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The value both root layouts put in `<html lang>`. It is the locale itself
 * rather than a separate string so the attribute cannot drift from the messages
 * actually loaded.
 */
export const HTML_LANG = DEFAULT_LOCALE;

/**
 * Wave-1 locale policy, declared rather than implied (`APP12-V02` §5A).
 *
 * Every flag here is `false`, and each one is a capability the checkpoint
 * forbids. They exist so the policy is assertable: `packages/i18n`'s tests read
 * these, and the applications' route trees are checked against them.
 */
export const LOCALE_POLICY = {
  /** No `/vi/...` segment: the route tree carries no locale prefix. */
  routePrefix: false,
  /** No language selector anywhere in either application. */
  languageSwitcher: false,
  /** `Accept-Language` is never consulted; the locale is a constant. */
  browserDetection: false,
  /** No locale cookie is written or read. */
  cookie: false,
} as const;

/** Narrowing guard for a value that claims to be a supported locale. */
export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
