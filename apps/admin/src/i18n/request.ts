import { createIntlRequestConfig } from '@embroidery/i18n';
import { getRequestConfig } from 'next-intl/server';

/**
 * The Admin's next-intl registration point (`APP12-V02` §5A.9).
 *
 * The Storefront twin of this file carries the reasoning; the short version is
 * that the locale, the message repository and the date formats are decided once
 * in `@embroidery/i18n` and both applications register the same configuration,
 * so an operator screen and a customer screen cannot print the same instant two
 * ways — the defect `V01-UX-021` recorded.
 */
export default getRequestConfig(() => createIntlRequestConfig());
