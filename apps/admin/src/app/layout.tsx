import { HTML_LANG, VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { AppProviders } from '../providers/app-providers';
import '../styles/main.scss';

/**
 * Every Admin document route renders per request (`APP12-H02` §19/§20).
 *
 * A CSP requirement, not a data-freshness one, and the same measured framework
 * constraint the Storefront root layout records: Next.js 16.2.10 applies the
 * per-response nonce inside the renderer, by reading the
 * `content-security-policy` **request** header `src/proxy.ts` sets. A route
 * prerendered at build time never reaches that renderer at request time, so its
 * inline RSC payload carries no nonce and the policy blocks it — a staff screen
 * that does not hydrate. Nothing in `base-server` bypasses the static cache on
 * account of a nonce, so the route has to be dynamic for the nonce to land.
 *
 * The cost is smaller here than on the Storefront: every Admin screen is behind
 * a session and reads live operational data, so nothing of consequence was
 * being served from a build-time cache to begin with.
 */
export const dynamic = 'force-dynamic';

/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `admin`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'admin');

export const metadata: Metadata = {
  title: seoMessage.text('app.title'),
  description: seoMessage.text('app.description'),
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={HTML_LANG}>
      <body>
        <NextIntlClientProvider>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
