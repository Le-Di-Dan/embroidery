'use client';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListRow } from '../model/gallery-list-rows';
import { GalleryCover } from './gallery-cover';

interface GalleryListTableProps {
  readonly rows: readonly GalleryListRow[];
}

/**
 * The desktop list (`866:905`).
 *
 * A real `<table>`, not a grid of `<div>`s: the approved layout *is* a table, so
 * a screen reader should be able to navigate it as one. The title is the row
 * header, because it is the identity an operator scans by and the value every
 * other cell qualifies. The gallery entry's UUID is never rendered — it is a
 * render key and nothing else.
 *
 * ### Four columns, which are the ones the model actually has
 *
 * Mục (cover + title + slug) · Thứ tự · Sản phẩm liên kết · Trạng thái, exactly
 * as `APP11-D01` drew them after removing the category column that
 * `gallery_entries` has no field for.
 *
 * ### Nothing here is interactive
 *
 * `APP11-A01` ships a read-only list: `/gallery/{entryId}` does not exist yet,
 * so a row link would answer a click with a 404. There is no anchor, no
 * clickable `<div>`, no row `onClick` and no keyboard target — a row is data,
 * and keyboard navigation therefore lands on nothing that is not there.
 * `APP11-A02` restores the row navigation the approved frame draws.
 *
 * ### Server order, preserved
 *
 * Nothing here sorts. The rows arrive in curated `(display_order, id)` order —
 * the same key the keyset cursor pages by — and a second client-side sort would
 * put the visible list out of step with the pagination that produced it. The
 * order value is rendered as the number it is, with no edit control beside it.
 */
export function GalleryListTable({ rows }: GalleryListTableProps) {
  return (
    <table className="gallery-table" data-testid="gallery-list-table">
      <caption className="gallery-table__caption">{GALLERY_LIST_COPY.page.tableLabel}</caption>
      <colgroup>
        <col className="gallery-table__col--entry" />
        <col className="gallery-table__col--order" />
        <col className="gallery-table__col--product" />
        <col className="gallery-table__col--status" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{GALLERY_LIST_COPY.columns.entry}</th>
          <th scope="col">{GALLERY_LIST_COPY.columns.displayOrder}</th>
          <th scope="col">{GALLERY_LIST_COPY.columns.linkedProduct}</th>
          <th scope="col">{GALLERY_LIST_COPY.columns.status}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-testid="gallery-list-row">
            <th scope="row" className="gallery-table__entry">
              <span className="gallery-table__entry-media">
                <GalleryCover assetId={row.coverAssetId} alt={row.coverAlt} />
              </span>
              <span className="gallery-table__entry-text">
                <span className="gallery-table__title">{row.title}</span>
                <span className="gallery-table__slug">
                  {`${GALLERY_LIST_COPY.entry.slugPrefix}${row.slug}`}
                </span>
                <span className="gallery-table__assets">
                  {GALLERY_LIST_COPY.entry.assetCount(row.assetCount)}
                </span>
              </span>
            </th>
            <td className="gallery-table__order" data-testid="gallery-list-order">
              {row.displayOrder}
            </td>
            <td className="gallery-table__product">
              {row.hasLinkedProduct
                ? GALLERY_LIST_COPY.linkedProduct.linked
                : GALLERY_LIST_COPY.linkedProduct.unlinked}
            </td>
            <td>
              <AdminStatusBadge
                token={row.status.token}
                label={row.status.label}
                tone={row.status.tone}
                symbol={row.status.symbol}
                testId="gallery-list-status"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
