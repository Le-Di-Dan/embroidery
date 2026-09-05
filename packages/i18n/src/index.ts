// Public surface of `@embroidery/i18n` — the canonical Vietnamese message
// repository and the locale authority shared by the Storefront and the Admin
// application (`APP12-V02` §5A).
//
// The package holds no React and no framework integration. Both applications
// wire next-intl themselves, in three lines each, against the configuration
// factory exported here; this package stays loadable from a plain Node test and
// from the message-integrity tooling.

export {
  DEFAULT_LOCALE,
  HTML_LANG,
  LOCALE_POLICY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from './locale';
export type { SupportedLocale } from './locale';

export { MESSAGE_NAMESPACES, VI_MESSAGES, getMessages } from './messages';
export type { Messages } from './messages';

export { formatMessage, messageView, resolveMessageNode } from './message-view';
export { hydrateMessages } from './hydrate';
export type { MessageValues, MessageView } from './message-view';

export {
  DATE_TIME_FORMATS,
  DISPLAY_INSTANT_SEPARATOR,
  DISPLAY_TIME_ZONE,
  INTL_FORMATS,
  formatDisplayDate,
  formatDisplayInstant,
} from './formats';

export { createIntlRequestConfig } from './request-config';
export type { IntlRequestConfig } from './request-config';
