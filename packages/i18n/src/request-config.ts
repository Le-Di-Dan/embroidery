/**
 * The next-intl request configuration both applications resolve their locale
 * from (`APP12-V02` §5A.9).
 *
 * next-intl reads a per-request configuration module that each Next application
 * registers with its plugin. Those two modules would be two places the locale,
 * the message repository and the date formats are chosen — and the first time
 * they disagree, the Admin and the Storefront print the same instant two ways
 * again, which is exactly the defect `V01-UX-021` recorded. So each application's
 * module is three lines that hand the work here.
 *
 * There is no negotiation in this file, and that is the point: `LOCALE_POLICY`
 * declares that Wave 1 reads no `Accept-Language`, no cookie and no route
 * segment, and the only way to honour that is for the locale to be a constant
 * rather than something derived per request.
 */
import { INTL_FORMATS, DISPLAY_TIME_ZONE } from './formats';
import { DEFAULT_LOCALE } from './locale';
import { getMessages, type Messages } from './messages';

/**
 * The shape next-intl's `getRequestConfig` callback must return. Declared
 * structurally rather than imported from next-intl so that this package — which
 * is also consumed by plain Node tests and by the message tooling — does not
 * take a hard dependency on the framework integration.
 */
export interface IntlRequestConfig {
  readonly locale: string;
  readonly messages: Messages;
  readonly timeZone: string;
  readonly formats: typeof INTL_FORMATS;
  readonly onError: (error: unknown) => void;
}

/**
 * A missing or malformed message must not be swallowed.
 *
 * next-intl's default behaviour logs and renders the key. That is right for a
 * customer's browser and wrong everywhere a defect can still be caught, so
 * development and test throw. §5A.13 requires exactly this asymmetry.
 */
function onIntlError(error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    throw error instanceof Error ? error : new Error(String(error));
  }
  // The production degradation path: the page renders with the key visible
  // rather than failing, and the cause is recorded where an operator can see it.
  console.error('[i18n]', error);
}

/** The whole request configuration, identical in both applications. */
export function createIntlRequestConfig(): IntlRequestConfig {
  return {
    locale: DEFAULT_LOCALE,
    messages: getMessages(DEFAULT_LOCALE),
    timeZone: DISPLAY_TIME_ZONE,
    formats: INTL_FORMATS,
    onError: onIntlError,
  };
}
