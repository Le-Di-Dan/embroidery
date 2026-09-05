import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { brandedPageTitle } from '../../features/storefront-seo';
import type { Metadata } from 'next';

import { VerificationQueryProvider } from '../../features/contact-verification';

/**
 * `/xac-minh-lien-he` — `APP4-S01`.
 *
 * The route stays a thin Server Component: it names the page and mounts the
 * capability. The flow is entirely client-side because every one of its states
 * is the result of an interaction, and there is nothing to render on the server
 * that would not immediately be replaced.
 *
 * Deliberately `noindex`. A verification screen has no standalone audience and
 * is reached from a flow; letting a crawler surface it would only produce
 * visitors with no challenge to answer.
 */
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `storefront.contactVerification`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'storefront.contactVerification');

export const metadata: Metadata = {
  title: brandedPageTitle(seoMessage.text('title')),
  description: seoMessage.text('description'),
  robots: { index: false, follow: false },
};

export default function ContactVerificationPage() {
  return <VerificationQueryProvider />;
}
