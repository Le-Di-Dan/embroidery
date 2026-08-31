'use client';

import Link from 'next/link';

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
 * ### One real link per row, and it is the title
 *
 * `APP11-A01` staged this: `/gallery/{entryId}` did not exist, so a row link
 * would have answered a click with a 404. `APP11-A02` builds the editor, and
 * the approved navigation is restored here.
 *
 * The destination is carried by an `<a>` around the title — not by a row
 * `onClick`, not by a clickable `<div>`, and not by a `tabIndex` on the `<tr>`.
 * A real anchor is focusable, announced as a link, opens in a new tab on
 * middle-click and shows its target in the status bar; a div that listens for
 * clicks does none of that. The rest of the row stays plain data, so the cells
 * beside it are readable without a keyboard operator having to tab through four
 * copies of the same destination.
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
                <Link
                  className="gallery-table__title"
                  href={row.href}
                  aria-label={GALLERY_LIST_COPY.entry.openLabel(row.title)}
                  data-testid="gallery-list-row-link"
                >
                  {row.title}
                </Link>
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
