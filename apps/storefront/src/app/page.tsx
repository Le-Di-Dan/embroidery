import type { Metadata } from 'next';

import { HOMEPAGE_COPY, HomepageScreen } from '../features/homepage';
import { STOREFRONT_HOME_ROUTE } from '../features/storefront-shell';
import { publicPageMetadata, publicPageTitle } from '../features/storefront-seo';

/**
 * Homepage metadata: the title and description it always had, plus the
 * self-canonical and public Open Graph block `APP11-S04` adds.
 *
 * Both come from `publicPageMetadata`, the one public-only builder — so the
 * canonical URL, `og:url` and this page's `/sitemap.xml` entry are composed by
 * the same function from the same origin and cannot name two different hosts.
 * The path is the shell's home constant rather than a `'/'` literal.
 *
 * There is no `og:image`. The store has no canonical social image, and
 * promoting a featured Product's photo here would silently become that policy
 * — chosen by whichever product happened to be first in the feed that day.
 *
 * `generateMetadata` rather than a static object because the origin is read at
 * request time; see the root layout for why that matters.
 */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    path: STOREFRONT_HOME_ROUTE,
    title: publicPageTitle(HOMEPAGE_COPY.hero.heading),
    description: HOMEPAGE_COPY.hero.lead,
  });
}

/**
 * `force-dynamic`, for the same correctness reason as `/kham-pha`: the Homepage
 * shows published products, publication is re-read on every API request, and
 * nothing in this system invalidates a cache — so a build-time or full-route
 * cached copy could keep showing a product the operator has unpublished.
 */
export const dynamic = 'force-dynamic';

/**
 * `/` — the Homepage / store introduction (`APP11-S01`), replacing the CP0
 * scaffold placeholder.
 *
 * A thin segment: the shared shell (root layout) owns the `<main>` landmark, the
 * header, the footer and the floating contact dock; this page contributes its
 * single `<h1>` and the six approved body sections into that slot. All
 * composition lives in the homepage feature.
 */
export default function HomePage() {
  return <HomepageScreen />;
}
