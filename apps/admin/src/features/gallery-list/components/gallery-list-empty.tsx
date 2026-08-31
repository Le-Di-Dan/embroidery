'use client';

import type { ReactNode } from 'react';

import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListFilterController } from '../hooks/use-gallery-list-filters';
import { galleryStatusLabel } from '../../../shared/presentation/gallery-status';
import { isGalleryListFiltered } from '../model/gallery-list-filters';

interface GalleryListEmptyProps {
  readonly controller: GalleryListFilterController;
  /** The approved create action, rendered in the unfiltered state only. */
  readonly createAction?: ReactNode;
}

/**
 * The two empty states, which are deliberately not one (`867:907`).
 *
 * An empty list because of a filter and an empty list because there is no
 * gallery are different facts, and they may not share a sentence. Getting it
 * backwards sends an operator hunting for a filter they never set, or tells
 * them the gallery is empty when they merely asked for archived entries.
 *
 * ### The unfiltered state carries the create action
 *
 * `867:907` draws "Tạo mục mới" here, and `APP11-A02` restores it now that the
 * editor route exists. It appears **only** in the unfiltered state: an operator
 * who filtered to "Đã lưu trữ" and found nothing does not want to create an
 * entry, they want to drop the filter — and offering both would put the
 * unrelated option beside the one they actually need.
 *
 * ### The filtered state names the condition back
 *
 * The active status is read back in the operator's own words — the same label
 * the pill and the select use — and clearing it is offered right there, so
 * they can see what to drop.
 */
export function GalleryListEmpty({ controller, createAction }: GalleryListEmptyProps) {
  const { filters, clearAll } = controller;

  if (!isGalleryListFiltered(filters)) {
    return (
      <div className="gallery-panel" data-testid="gallery-list-empty">
        <p className="gallery-panel__title">{GALLERY_LIST_COPY.states.emptyTitle}</p>
        <p className="gallery-panel__body">{GALLERY_LIST_COPY.states.emptyBody}</p>
        {createAction === undefined ? null : (
          <div className="gallery-panel__actions">{createAction}</div>
        )}
      </div>
    );
  }

  return (
    <div className="gallery-panel" data-testid="gallery-list-filter-empty">
      <p className="gallery-panel__title">{GALLERY_LIST_COPY.states.filteredEmptyTitle}</p>
      <p className="gallery-panel__body" data-testid="gallery-list-filter-condition">
        {GALLERY_LIST_COPY.states.filteredEmptyActive(galleryStatusLabel(filters.status))}
      </p>
      <p className="gallery-panel__body">{GALLERY_LIST_COPY.states.filteredEmptyBody}</p>
      <button
        type="button"
        className="gallery-panel__action"
        data-testid="gallery-list-clear-filter"
        onClick={clearAll}
      >
        {GALLERY_LIST_COPY.filters.reset}
      </button>
    </div>
  );
}
