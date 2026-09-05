import { HTML_LANG, VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { getStorefrontPublicOrigin } from '../config/public-origin';
import { StorefrontShell } from '../features/storefront-shell';
import '../styles/main.scss';

/**
 * Root metadata, and the exact line where `APP11-S04` stops.
 *
 * `metadataBase` is the whole of the technical SEO infrastructure that may live
 * at the root, and it lives here because it is **URL resolution**, not a
 * payload: it emits no tag of its own and exists so a relative value elsewhere
 * — the `APP2` Product canonical, the `APP11-S03` Gallery canonical — resolves
 * against the real public origin instead of a framework-guessed `localhost`.
 *
 * There is deliberately **no `openGraph` block and no `robots` directive here.**
 * Next merges metadata field by field down the segment tree, so a root
 * `openGraph` would be inherited by `/truy-cap/thanh-toan` and every other
 * secure route that did not think to override it — publishing an `og:url` for a
 * page nobody may link to, and making a route that forgot to opt out
 * indistinguishable in source from one that never needed to. `APP11-G01`
 * warned about precisely this. Public Open Graph is therefore *requested* by
 * each public page through `publicPageMetadata`, and a private route inherits
 * nothing because there is nothing to inherit.
 *
 * The title and description stay as the app-wide fallback every route already
 * overrides.
 */
/**
 * Every document route renders per request (`APP12-H02` §19/§20).
 *
 * This is a **CSP requirement**, not a data-freshness one, and the framework
 * mechanism behind it was measured rather than assumed.
 *
 * The nonce that makes `script-src` safe is minted per response in
 * `src/proxy.ts`. Next.js 16.2.10 applies it by reading the
 * `content-security-policy` **request** header inside `parseRequestHeaders`
 * (`next/dist/server/app-render/app-render.js`) and stamping the extracted
 * value onto each `<script>` the renderer emits. A statically prerendered route
 * never reaches that renderer at request time: its HTML was written at build
 * time, when no nonce existed. Measured on this build before this export was
 * added — a static `/truy-cap/don-hang` answered a response nonce in its header
 * and `0` nonced script tags in its body, while a dynamic `/` answered `23`
 * carrying the exact response nonce.
 *
 * There is no cache-bypass path: nothing in `base-server` inspects the CSP
 * header, so a nonce does not opt a route into dynamic rendering on its own.
 * The choice was therefore between serving prerendered pages whose inline RSC
 * payload the policy blocks — a page that does not hydrate — and rendering them
 * per request. Weakening `script-src` back to `'unsafe-inline'` for the static
 * set was the third option and is the one §20 forbids.
 *
 * The cost is bounded and known: the routes this changes from static are the
 * content and secure-shell pages, which fetch nothing — they cost one React SSR
 * pass, not an I/O round trip — and the data-backed routes were already
 * dynamic. `generateStaticParams` on `/chinh-sach/[slug]` still runs and still
 * declares its four slugs; it simply no longer prerenders them. Measurement of
 * the actual cost belongs to `APP12-H05`, which owns performance; H02 records
 * it rather than trading security away for it.
 */
/**
 * The app-wide fallback title and description, from the canonical Vietnamese
 * message repository (`packages/i18n/messages/vi/seo.json`).
 */
const seoMessage = messageView(VI_MESSAGES.seo);

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    // Resolved when the metadata is generated, never at module load. A static
    // `export const metadata` would read the environment the moment this file is
    // imported — by a component test, by a tool walking the route tree — and
    // turn a configuration concern into an import-time crash in places that
    // publish no URL at all. Here it fails closed exactly where it should: at
    // the request that would otherwise have served a canonical URL pointing at
    // a host nobody configured.
    metadataBase: new URL(getStorefrontPublicOrigin()),
    title: seoMessage.text('storefront.app.title'),
    description: seoMessage.text('storefront.app.description'),
  };
}

/**
 * Storefront root layout. It stays a Server Component and wraps every route in the
 * shared shell (header · `<main>` slot · footer). The shell owns the page
 * landmarks; each page owns its own `<h1>` and business content. The only client
 * interactivity (the mobile drawer) is isolated inside the shell's header island.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={HTML_LANG}>
      <body>
        <NextIntlClientProvider>
          <StorefrontShell>{children}</StorefrontShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
