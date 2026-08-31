import { cache } from 'react';

import {
  publicGalleryEntryDetail,
  type PublicGalleryEntryDetailResponse,
} from '@embroidery/api-client';
import { isAxiosError } from 'axios';

import { getServerApiClient } from '../../../config/server-api-client';
import { isPublicGalleryEntrySlug } from '../model/gallery-detail-slug';

/**
 * The single server-side read of one published gallery entry (`APP11-B03`).
 *
 * Anonymous by construction, exactly like the feed's loader and the Product
 * Detail loader: no cookie is forwarded and no header is read. The published
 * gallery is identical for every visitor, which is what makes it safe to
 * render on the server without knowing who asked.
 */

/** What the route can learn about a slug, with the reason never widened. */
export type GalleryDetailResult =
  | { readonly kind: 'found'; readonly entry: PublicGalleryEntryDetailResponse }
  /**
   * Unknown slug, malformed slug, `DRAFT`, `ARCHIVED`, or published with no
   * currently deliverable image. `APP11-B03` answers one identical 404 for all
   * of them precisely so a public caller cannot tell unreleased work from work
   * that never existed, and this type keeps them indistinguishable here too.
   */
  | { readonly kind: 'not-found' }
  /** Anything else: a real failure the visitor may retry. */
  | { readonly kind: 'error' };

async function readGalleryDetail(slug: string): Promise<GalleryDetailResult> {
  // A malformed slug cannot name an entry, so it never becomes a request. This
  // keeps a scanner walking `/bo-suu-tap/<junk>` off the API entirely and lands
  // it on exactly the same surface a real unknown slug reaches.
  if (!isPublicGalleryEntrySlug(slug)) return { kind: 'not-found' };

  try {
    const body = await publicGalleryEntryDetail(slug, { instance: getServerApiClient() });
    return { kind: 'found', entry: body.data };
  } catch (error: unknown) {
    // Only the exact safe 404 becomes not-found. Every other status — including
    // a 500 that happens to mention the slug — is an error the visitor may
    // retry, because rendering "this does not exist" for a broken database
    // would be a lie told with a straight face.
    if (isAxiosError(error) && error.response?.status === 404) return { kind: 'not-found' };
    return { kind: 'error' };
  }
}

/**
 * Request-scoped memoization.
 *
 * `generateMetadata` and the page component both need the same entry, and
 * Next.js calls them separately for one browser request. React's `cache()`
 * makes the second call return the first one's result **within that request**
 * and nothing beyond it — so the document head and the body can never describe
 * two different reads, and the page issues one backend call rather than two.
 *
 * The other half is a correctness requirement, not an optimisation: `APP11-B03`
 * re-reads publication and image eligibility on every request precisely because
 * nothing in this system invalidates a cache, so a process-global memo would
 * keep serving an entry the operator has just unpublished or an image whose
 * bytes have been withdrawn.
 */
export const loadGalleryDetail = cache(readGalleryDetail);
