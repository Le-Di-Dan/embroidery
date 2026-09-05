import { createIntlRequestConfig } from '@embroidery/i18n';
import { getRequestConfig } from 'next-intl/server';

/**
 * The Storefront's next-intl registration point (`APP12-V02` §5A.9).
 *
 * next-intl requires this module to exist per application — the plugin in
 * `next.config.ts` names it — but nothing about the locale, the messages or the
 * date formats is decided here. All of it comes from `@embroidery/i18n`, so the
 * Storefront and the Admin cannot answer the same question differently.
 *
 * There is no request argument in play on purpose. Wave 1 declares
 * `LOCALE_POLICY.routePrefix`, `.browserDetection` and `.cookie` all `false`, so
 * the locale is a constant and reading the request to derive it would be the
 * first step towards a behaviour the checkpoint forbids.
 */
export default getRequestConfig(() => createIntlRequestConfig());
