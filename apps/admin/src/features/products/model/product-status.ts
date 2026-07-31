/**
 * Product lifecycle presentation.
 *
 * The contract types `status` as a closed union, but a running server is free
 * to answer with a value this build predates. So this module parses rather than
 * casts: a recognised value maps to a presentation state, and anything else
 * becomes `UNKNOWN`, which renders neutral copy — never the raw server value,
 * and never a guess that a product is published.
 *
 * Copy is the approved status language (`498:272` — Bộ lọc trạng thái).
 */
import { AdminProductListStatus } from '@embroidery/api-client';

import { PRODUCT_COPY } from './product-copy';

/** What the screen shows; deliberately not the wire vocabulary. */
export type ProductStatusPresentation = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'UNKNOWN';

/**
 * Keyed by the generated enum, so a status added to the contract fails the
 * build here instead of silently rendering as "Chưa xác định".
 */
const PRESENTATION_BY_STATUS: Readonly<
  Record<
    (typeof AdminProductListStatus)[keyof typeof AdminProductListStatus],
    ProductStatusPresentation
  >
> = {
  [AdminProductListStatus.DRAFT]: 'DRAFT',
  [AdminProductListStatus.PUBLISHED]: 'PUBLISHED',
  [AdminProductListStatus.ARCHIVED]: 'ARCHIVED',
};

const LABEL: Readonly<Record<ProductStatusPresentation, string>> = {
  DRAFT: PRODUCT_COPY.status.draft,
  PUBLISHED: PRODUCT_COPY.status.published,
  ARCHIVED: PRODUCT_COPY.status.archived,
  UNKNOWN: PRODUCT_COPY.status.unknown,
};

/** Maps a wire status to presentation. Unknown input fails safely. */
export function parseProductStatus(status: unknown): ProductStatusPresentation {
  if (typeof status !== 'string') {
    return 'UNKNOWN';
  }
  return PRESENTATION_BY_STATUS[status as keyof typeof PRESENTATION_BY_STATUS] ?? 'UNKNOWN';
}

/** The approved Vietnamese label for a presentation state. */
export function productStatusLabel(presentation: ProductStatusPresentation): string {
  return LABEL[presentation];
}
