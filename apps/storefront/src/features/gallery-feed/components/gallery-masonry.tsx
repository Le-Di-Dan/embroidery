import { GALLERY_COPY } from '../model/gallery-copy';
import type { GalleryFeedCard } from '../model/gallery-feed';
import { GalleryCard } from './gallery-card';

/**
 * The variable-height masonry (UI05 Collections Index: 3 columns desktop,
 * 2 tablet, 1 mobile at ~410 / ~452 / ~342px).
 *
 * UI05's density, **not** UI02's. `/kham-pha` runs 5/3/2 at 237px because a
 * product card is an image and two short lines; a gallery card carries a title
 * and a paragraph of editorial copy, so it needs the wider measure. The masonry
 * *architecture* is shared with UI02 — UI05 names it as its source — but the
 * column counts are not.
 *
 * One semantic collection and one card tree. The columns are produced by CSS
 * multi-column (`columns` + `break-inside: avoid`), which is the narrowest
 * approach that keeps **source order linear**: the browser distributes the same
 * single `<ul>` across columns at paint time, so assistive technology and "view
 * source" both read the entries in `display_order ASC, id ASC` — the order the
 * curator set and the server returned.
 *
 * The alternative — slicing the list into per-column arrays in JavaScript —
 * would reorder the DOM to match the visual layout. That, height-balancing and
 * CSS `order` are all forbidden here for the same reason: each makes the reading
 * order a function of measured pixels rather than of the curation.
 *
 * There is no masonry dependency and no duplicated per-viewport tree; one list
 * serves every breakpoint.
 */
export function GalleryMasonry({ cards }: { cards: readonly GalleryFeedCard[] }) {
  return (
    <ul className="gallery-feed__masonry" aria-label={GALLERY_COPY.feedLabel}>
      {cards.map((card) => (
        <li key={card.slug} className="gallery-feed__masonry-item">
          <GalleryCard card={card} />
        </li>
      ))}
    </ul>
  );
}
