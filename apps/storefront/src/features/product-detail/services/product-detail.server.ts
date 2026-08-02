import { cache } from 'react';

import { publicProductDetail, type PublicProductDetailResponse } from '@embroidery/api-client';
import { isPublicProductSlug } from '@embroidery/contracts';
import { isAxiosError } from 'axios';

import { getServerApiClient } from '../../../config/server-api-client';

/**
 * The single server-side read of one published Product (`APP2-S02`).
 *
 * Anonymous by construction, exactly like the Discover feed's loader: no cookie
 * is forwarded and no header is read. The public catalog is identical for every
 * visitor, which is what makes it safe to render on the server without knowing
 * who asked.
 */

/** What the route can learn about a slug, with the reason never widened. */
export type ProductDetailResult =
  | { readonly kind: 'found'; readonly product: PublicProductDetailResponse }
  /** Unknown, DRAFT, ARCHIVED or non-public category — the API refuses to say which. */
  | { readonly kind: 'not-found' }
  /** Anything else: a real failure the visitor may retry. */
  | { readonly kind: 'error' };

async function readProductDetail(slug: string): Promise<ProductDetailResult> {
  // A malformed slug cannot name a Product, so it never becomes a request. This
  // keeps a scanner walking `/san-pham/<junk>` off the API entirely, and it is
  // the same syntax the media-path builder enforces (`@embroidery/contracts`),
  // so the page and its images can never disagree about what a slug is.
  if (!isPublicProductSlug(slug)) return { kind: 'not-found' };

  try {
    const body = await publicProductDetail(slug, { instance: getServerApiClient() });
    return { kind: 'found', product: body.data };
  } catch (error: unknown) {
    // Only the exact safe 404 becomes not-found. Every other status — including a
    // 500 that happens to mention the slug — is an error the visitor may retry,
    // because rendering "this artwork does not exist" for a broken database would
    // be a lie told with a straight face.
    if (isAxiosError(error) && error.response?.status === 404) return { kind: 'not-found' };
    return { kind: 'error' };
  }
}

/**
 * Request-scoped memoization.
 *
 * `generateMetadata` and the page component both need the same Product, and
 * Next.js calls them separately for one browser request. React's `cache()` makes
 * the second call return the first one's result **within that request** and
 * nothing beyond it — so the title and the body can never describe two different
 * reads, while a new request still asks the API again.
 *
 * That last half is a correctness requirement, not an optimisation: publication
 * is re-read on every API request precisely because nothing in this system
 * invalidates a cache, so a process-global memo would keep serving a Product the
 * operator has unpublished.
 */
export const loadProductDetail = cache(readProductDetail);
