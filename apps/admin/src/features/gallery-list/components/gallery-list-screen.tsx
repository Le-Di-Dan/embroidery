'use client';

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
 * Read-only by construction, and this is the one place `APP11-A01` departs from
 * the approved end-state frames. `866:905` draws a "Tạo mục mới" action and
 * makes each row a link to `/gallery/{entryId}`; both belong to `APP11-A02`,
 * which builds the editor route behind them. Shipping either one here would put
 * a control on screen that answers a click with a 404, so both are staged:
 *
 * ```text
 * STAGED_ACTION_OWNERSHIP =
 *   create_action  -> APP11-A02
 *   row_navigation -> APP11-A02
 * ```
 *
 * The staging is recorded here and in the completion report — not on the page.
 * An operator has no use for a checkpoint identifier, and a screen that
 * explains its own delivery schedule is a screen carrying engineering notes
 * into production. What the operator sees is a list that is simply read-only;
 * the approved visual structure is otherwise preserved, and `APP11-A02`
 * restores the full end-state.
 *
 * There is exactly one `<h1>`, and the shell around it is the authenticated
 * `(protected)` layout — this screen creates no session path of its own.
 */
export function GalleryListScreen() {
  const controller = useGalleryListFilters();

  return (
    <section className="gallery">
      <header className="gallery__header">
        <p className="gallery__breadcrumb">{GALLERY_LIST_COPY.page.breadcrumb}</p>
        <h1 className="gallery__title">{GALLERY_LIST_COPY.page.title}</h1>
      </header>

      <GalleryListFilterBar controller={controller} />

      <GalleryListCollection controller={controller} />
    </section>
  );
}
