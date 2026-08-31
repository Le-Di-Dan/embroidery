'use client';

import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import type { GalleryListFilterController } from '../hooks/use-gallery-list-filters';
import { galleryStatusLabel } from '../model/gallery-status';
import { isGalleryListFiltered } from '../model/gallery-list-filters';

interface GalleryListEmptyProps {
  readonly controller: GalleryListFilterController;
}

/**
 * The two empty states, which are deliberately not one (`867:907`).
 *
 * An empty list because of a filter and an empty list because there is no
 * gallery are different facts, and they may not share a sentence. Getting it
 * backwards sends an operator hunting for a filter they never set, or tells
 * them the gallery is empty when they merely asked for archived entries.
 *
 * ### The unfiltered state offers no create action, and says why
 *
 * `867:907` draws "Tạo mục mới" as part of the phase end-state. `APP11-A02`
 * owns creation and the editor route behind it, so a create control here would
 * be a button with nowhere to go — dead navigation shipped between two
 * checkpoints. Rather than leaving the absence unexplained, the body states
 * where entries come from and that this step has no create screen yet, so the
 * operator learns the sequence instead of hunting for a missing button.
 * `STAGED_ACTION_OWNERSHIP` records it, and A02 restores the approved action.
 *
 * ### The filtered state names the condition back
 *
 * The active status is read back in the operator's own words — the same label
 * the pill and the select use — and clearing it is offered right there, so
 * they can see what to drop.
 */
export function GalleryListEmpty({ controller }: GalleryListEmptyProps) {
  const { filters, clearAll } = controller;

  if (!isGalleryListFiltered(filters)) {
    return (
      <div className="gallery-panel" data-testid="gallery-list-empty">
        <p className="gallery-panel__title">{GALLERY_LIST_COPY.states.emptyTitle}</p>
        <p className="gallery-panel__body">{GALLERY_LIST_COPY.states.emptyBody}</p>
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
