import { GALLERY_COPY } from '../model/gallery-copy';

/**
 * The first page is in flight and nothing is on screen yet (UI05 `357:3`).
 *
 * A **gallery-shaped** skeleton rather than a bare line of text: the approved
 * loading board draws the masonry's own silhouette, and placeholders that
 * occupy roughly the space the cards will occupy are what stops the page
 * jumping when they arrive.
 *
 * The heights below vary deliberately. A column of identical blocks would
 * promise a uniform grid and then deliver a variable-height masonry; varying
 * them tells the truth about what is coming.
 *
 * The blocks are `aria-hidden` and the state is carried in words by one polite
 * live region. A screen-reader user hears "Đang tải bộ sưu tập…" once, instead
 * of being walked through six meaningless list items.
 */
const SKELETON_TILES = [1, 2, 3, 4, 5, 6] as const;

export function GalleryInitialLoading() {
  return (
    <div className="gallery-feed__loading">
      <p className="gallery-feed__notice-body" role="status" aria-live="polite">
        {GALLERY_COPY.initialLoading}
      </p>
      <ul className="gallery-feed__masonry" aria-hidden="true">
        {SKELETON_TILES.map((tile) => (
          <li key={tile} className="gallery-feed__masonry-item">
            <div className={`gallery-feed__skeleton gallery-feed__skeleton--${tile % 3}`}>
              <div className="gallery-feed__skeleton-media" />
              <div className="gallery-feed__skeleton-line gallery-feed__skeleton-line--title" />
              <div className="gallery-feed__skeleton-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
