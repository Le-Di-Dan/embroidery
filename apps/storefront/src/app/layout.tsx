import type { Metadata } from 'next';
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
    title: 'Embroidery Commerce — Storefront',
    description: 'Cửa hàng thêu — sản phẩm nền và dịch vụ thêu theo yêu cầu.',
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
    <html lang="vi">
      <body>
        <StorefrontShell>{children}</StorefrontShell>
      </body>
    </html>
  );
}
