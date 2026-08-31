import type { Metadata } from 'next';

import { publicPageMetadata } from '../../storefront-seo/model/public-page-metadata';
import type { ContentPage } from './content-page';

/**
 * One content page's public metadata (`APP11-S05`).
 *
 * A four-line adapter, and deliberately not a new SEO helper: it hands the S04
 * builder the three fields a `ContentPage` already carries. Every canonical URL,
 * `og:url`, `og:title`, `og:description` and locale on these pages is therefore
 * produced by the same `publicPageMetadata` the Homepage, Discover, Product and
 * gallery routes use, resolved against `STOREFRONT_PUBLIC_ORIGIN` — S05 adds no
 * SEO infrastructure and hard-codes no origin.
 *
 * Existing because each of the four route segments would otherwise repeat the
 * same three-field mapping, and the policy segment would have to repeat it while
 * also handling the unknown-slug branch.
 *
 * ## Imported by path, not through the storefront-seo barrel
 *
 * That barrel also exports `PUBLIC_STATIC_ROUTES`, which reads this feature's
 * policy set — so going through it would close a module cycle
 * (content-pages -> seo barrel -> static routes -> content-pages) that fails at
 * load. `public-page-metadata` is a leaf; importing it directly is the same
 * narrow, documented exception the shell route constants carry.
 *
 * ## No `imagePath`
 *
 * `publicPageMetadata` emits `og:image` only when the caller has a genuinely
 * public image from its own contract. A content page has no contract and no
 * canonical representative image, and reaching for a Product photograph or a
 * gallery cover would make whichever image was picked the store's social
 * preview for its policies. Title, description and URL are what these pages
 * legitimately have; `opengraph-image.ts` is not added.
 *
 * ## `index, follow` without saying so
 *
 * No `robots` directive is emitted, which is the indexable state: the root
 * layout declares none either (S04 kept it deliberately empty so nothing is
 * inherited by a secure route), so a page with no directive is indexable by
 * default. The four content pages want exactly that. The unknown-policy branch
 * gets the opposite by calling `notFound()` before any metadata is built, so it
 * inherits Next's own `noindex` not-found behaviour rather than a directive
 * written here.
 */
export function contentPageMetadata(page: ContentPage): Metadata {
  return publicPageMetadata({
    path: page.path,
    title: page.metaTitle,
    description: page.metaDescription,
  });
}
