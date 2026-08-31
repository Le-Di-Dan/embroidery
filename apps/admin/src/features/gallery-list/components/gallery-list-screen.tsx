'use client';

import type { ReactNode } from 'react';

import { useGalleryListFilters } from '../hooks/use-gallery-list-filters';
import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';
import { GalleryListCollection } from './gallery-list-collection';
import { GalleryListFilterBar } from './gallery-list-filter-bar';

/**
 * `/gallery` — the Admin gallery list (`866:905`, `867:907`, `867:946`).
 *
 * Composition only. The filter state lives in the URL and the collection owns
 * its own query, so this component holds no data and no derived list state.
 *
 * ## The create action arrives as a node, not as a dependency
 *
 * `866:905` and `867:907` draw a "Tạo mục mới" action. `APP11-A01` staged it,
 * because the route behind it did not exist and a control that answers a click
 * with a 404 is worse than an absent one; `APP11-A02` builds that route and
 * restores the action.
 *
 * It is passed in rather than imported. Creating an entry is the first step of
 * the *editor's* capability — it knows the create body, the slug grammar and
 * the address to navigate to — and the editor already depends on this feature
 * for the list's route helper and cache root. Importing back the other way
 * would close that into a cycle between two feature barrels for no gain. So the
 * route file composes the two, this screen renders an opaque node in the two
 * places the approved frames draw the action, and the list keeps knowing
 * nothing about the editor.
 *
 * The prop is optional: a list rendered without it is still a correct,
 * complete, read-only list, which is what keeps this component testable on its
 * own.
 *
 * There is exactly one `<h1>`, and the shell around it is the authenticated
 * `(protected)` layout — this screen creates no session path of its own.
 */
interface GalleryListScreenProps {
  /** The approved create action, supplied by the route file. */
  readonly createAction?: ReactNode;
}

export function GalleryListScreen({ createAction }: GalleryListScreenProps = {}) {
  const controller = useGalleryListFilters();

  return (
    <section className="gallery">
      <header className="gallery__header">
        <div className="gallery__heading">
          <p className="gallery__breadcrumb">{GALLERY_LIST_COPY.page.breadcrumb}</p>
          <h1 className="gallery__title">{GALLERY_LIST_COPY.page.title}</h1>
        </div>
        {createAction === undefined ? null : (
          <div className="gallery__header-actions">{createAction}</div>
        )}
      </header>

      <GalleryListFilterBar controller={controller} />

      <GalleryListCollection controller={controller} createAction={createAction} />
    </section>
  );
}
