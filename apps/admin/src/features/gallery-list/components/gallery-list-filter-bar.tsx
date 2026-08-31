'use client';

import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListFilterController } from '../hooks/use-gallery-list-filters';
import {
  GALLERY_STATUS_FILTER_OPTIONS,
  isGalleryListFiltered,
  type GalleryStatusFilter,
} from '../model/gallery-list-filters';

interface GalleryListFilterBarProps {
  readonly controller: GalleryListFilterController;
}

/**
 * The one approved list filter (`866:905`), reusing the labelled-select filter
 * bar `APP2-D03` established for Admin lists.
 *
 * Native `<select>` on purpose: keyboard- and screen-reader-correct without a
 * line of interaction code, and the approved control is a labelled select, not
 * a custom listbox. The label is permanently visible — a placeholder that
 * disappears on selection leaves the operator no way to re-read what the
 * control means.
 *
 * The first option is "Tất cả trạng thái", and choosing it sends **no** status
 * at all rather than an `ALL` token the contract does not define. The other
 * three are the whole vocabulary, derived from the generated enum.
 *
 * The reset control appears only when something is actually filtered, so the
 * operator is never offered a control that would do nothing. The select stays
 * mounted and enabled while a page is loading, so the operator can always see
 * and change what they asked for.
 */
export function GalleryListFilterBar({ controller }: GalleryListFilterBarProps) {
  const { filters, setStatus, clearAll } = controller;

  return (
    <div className="gallery-filters">
      <div className="gallery-filter">
        <label className="gallery-filter__label" htmlFor="gallery-filter-status">
          {GALLERY_LIST_COPY.filters.statusLabel}
        </label>
        <select
          id="gallery-filter-status"
          className="gallery-filter__control"
          value={filters.status}
          onChange={(event) => setStatus(event.target.value as GalleryStatusFilter)}
        >
          {GALLERY_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isGalleryListFiltered(filters) ? (
        <button
          type="button"
          className="gallery-filters__reset"
          data-testid="gallery-list-reset"
          onClick={clearAll}
        >
          {GALLERY_LIST_COPY.filters.reset}
        </button>
      ) : null}
    </div>
  );
}
