import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { brandedPageTitle } from '../../../features/storefront-seo';
import type { Metadata } from 'next';

import {
  CustomRequestConfirmationScreen,
  readRequestCode,
} from '../../../features/custom-request-confirmation';

/**
 * `/yeu-cau/da-gui` — the destination `APP5-S01` hands off to (`660:3`).
 *
 * The route stays thin: it takes the one query parameter, hands it to the
 * feature's validator, and mounts the screen. It performs no data fetch,
 * because there is nothing to fetch — the code is display-only and opens
 * nothing (`APP5-G01` §5), and no endpoint accepts it.
 *
 * `noindex, nofollow`, following the `APP4-S01` convention: the page has no
 * standalone audience and its URL carries a request code that has no business
 * in a search index.
 */
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `storefront.requestSent`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'storefront.requestSent');

export const metadata: Metadata = {
  title: brandedPageTitle(seoMessage.text('title')),
  robots: { index: false, follow: false },
};

interface ConfirmationPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomRequestSubmittedPage({ searchParams }: ConfirmationPageProps) {
  const code = readRequestCode((await searchParams).ma);
  return <CustomRequestConfirmationScreen code={code} />;
}
