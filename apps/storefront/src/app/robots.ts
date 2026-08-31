import type { MetadataRoute } from 'next';

import { toAbsolutePublicUrl } from '../config/public-origin';
import {
  ROBOTS_ALLOW,
  ROBOTS_DISALLOW,
  ROBOTS_USER_AGENT,
  SITEMAP_PATH,
} from '../features/storefront-seo';

/**
 * `/robots.txt` — the crawl boundary (`APP11-S04`).
 *
 * A framework **metadata route**, not a page: it adds no browser page to the
 * Storefront's route count and renders no UI. The segment is deliberately thin,
 * exactly as a `page.tsx` is: the policy — which families are fenced off, which
 * are emphatically not, and why `robots.txt` never replaces a page-level
 * `noindex` — lives in `features/storefront-seo/model/robots-policy.ts`.
 *
 * `force-dynamic` for the reason the public pages use it: the sitemap URL is
 * composed from configuration read at request time, so a build-time copy would
 * bake whatever origin the image was built with into a file served from a
 * different one. It also keeps the fail-closed behaviour where it belongs — an
 * unset `STOREFRONT_PUBLIC_ORIGIN` fails this request rather than the build.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: ROBOTS_USER_AGENT,
      allow: ROBOTS_ALLOW,
      disallow: [...ROBOTS_DISALLOW],
    },
    // Exactly one sitemap, absolute as the protocol requires. It is the only
    // URL in this file, and it is composed through the one origin authority.
    sitemap: toAbsolutePublicUrl(SITEMAP_PATH),
  };
}
