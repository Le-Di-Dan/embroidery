import type { Metadata } from 'next';

import { HOMEPAGE_COPY, HomepageScreen } from '../features/homepage';

/**
 * Homepage-specific metadata only — a title and a description, per the existing
 * page convention (`/kham-pha` sets the same two).
 *
 * No `metadataBase`, canonical URL, Open Graph block, robots directive or
 * structured data: technical SEO infrastructure is `APP11-S04`'s, and a
 * canonical or an absolute URL invented here would quietly lock an origin the
 * Product Owner has not approved.
 */
export const metadata: Metadata = {
  title: `${HOMEPAGE_COPY.hero.heading} — Xưởng Thêu`,
  description: HOMEPAGE_COPY.hero.lead,
};

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
