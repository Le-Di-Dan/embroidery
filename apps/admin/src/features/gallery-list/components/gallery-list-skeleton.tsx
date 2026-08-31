import { GALLERY_LIST_COPY } from '../model/gallery-list-copy';

/** How many placeholder rows the skeleton draws. */
const SKELETON_ROWS = 6;

/**
 * The loading state.
 *
 * Placeholder rows in the list's own geometry rather than a spinner, so the
 * page does not jump when the real rows land — and, more importantly, so the
 * empty state never flashes before the first page has settled. "0 kết quả"
 * while nothing is known would be a claim the screen cannot make.
 *
 * The bars are `aria-hidden` and a single `role="status"` line carries the
 * announcement, so the loading state is *told* rather than shown as a silent
 * skeleton.
 */
export function GalleryListSkeleton() {
  return (
    <div className="gallery-skeleton" data-testid="gallery-list-skeleton">
      <p className="gallery-skeleton__status" role="status">
        {GALLERY_LIST_COPY.states.loading}
      </p>
      <ul className="gallery-skeleton__rows" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="gallery-skeleton__row">
            <span className="gallery-skeleton__bar gallery-skeleton__bar--cover" />
            <span className="gallery-skeleton__bar gallery-skeleton__bar--entry" />
            <span className="gallery-skeleton__bar gallery-skeleton__bar--order" />
            <span className="gallery-skeleton__bar gallery-skeleton__bar--product" />
            <span className="gallery-skeleton__bar gallery-skeleton__bar--status" />
          </li>
        ))}
      </ul>
    </div>
  );
}
