'use client';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListRow } from '../model/gallery-list-rows';
import { GalleryCover } from './gallery-cover';

interface GalleryCardListProps {
  readonly rows: readonly GalleryListRow[];
}

/**
 * The mobile presentation (`867:946`): a single-column list of informational
 * cards carrying the same four facts as the desktop table.
 *
 * The hierarchy is the table's hierarchy, not a reduced one: cover, title,
 * slug, image count, order, linked-product signal and status are all here, so
 * nothing essential is hidden at 390 and there is no horizontal scroll and no
 * overflow menu holding a dropped column. The stylesheet swaps this list and
 * the table at the shell breakpoint; only one is ever presented.
 *
 * Not tappable, and not for layout reasons: `/gallery/{entryId}` does not exist
 * until `APP11-A02`, so a card surface that swallowed a tap would answer it
 * with a 404. The cards are content until A02 gives them a destination.
 */
export function GalleryCardList({ rows }: GalleryCardListProps) {
  return (
    <ul className="gallery-card-list" aria-label={GALLERY_LIST_COPY.page.tableLabel}>
      {rows.map((row) => (
        <li key={row.key} className="gallery-card" data-testid="gallery-list-card">
          <div className="gallery-card__top">
            <GalleryCover assetId={row.coverAssetId} alt={row.coverAlt} />
            <div className="gallery-card__info">
              <p className="gallery-card__title">{row.title}</p>
              <p className="gallery-card__slug">
                {`${GALLERY_LIST_COPY.entry.slugPrefix}${row.slug}`}
              </p>
              <p className="gallery-card__assets">
                {GALLERY_LIST_COPY.entry.assetCount(row.assetCount)}
              </p>
            </div>
          </div>
          <dl className="gallery-card__facts">
            <dt>{GALLERY_LIST_COPY.columns.displayOrder}</dt>
            <dd data-testid="gallery-card-order">{row.displayOrder}</dd>
            <dt>{GALLERY_LIST_COPY.columns.linkedProduct}</dt>
            <dd>
              {row.hasLinkedProduct
                ? GALLERY_LIST_COPY.linkedProduct.linked
                : GALLERY_LIST_COPY.linkedProduct.unlinked}
            </dd>
          </dl>
          <div className="gallery-card__status">
            <AdminStatusBadge
              token={row.status.token}
              label={row.status.label}
              tone={row.status.tone}
              symbol={row.status.symbol}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
