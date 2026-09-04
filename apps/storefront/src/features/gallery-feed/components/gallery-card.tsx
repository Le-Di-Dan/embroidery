import Link from 'next/link';

import { buildStorefrontGalleryDetailPath } from '../../storefront-shell';
import { GalleryCover } from './gallery-cover';
import { GALLERY_COPY, galleryDetailActionLabel } from '../model/gallery-copy';
import type { GalleryFeedCard } from '../model/gallery-feed';

/**
 * One gallery entry in the feed (UI05 Collections Index card: cover, then
 * title, then a short descriptive line, then the link into the entry's own
 * page).
 *
 * **The detail action is live as of `APP11-S03`.** The card shipped in
 * `APP11-S02` as a deliberately non-interactive `<article>` because
 * `/bo-suu-tap/[slug]` did not exist; it does now, so the text link UI05 always
 * drew — with the hover and pressed treatments on `353:2` — is real.
 *
 * It is **one** semantic action, not a clickable card. UI05 draws a text link
 * rather than making the whole tile a hit area, and the affordance follows the
 * drawing: an `<article>` carrying exactly one `<a>`. That keeps a single Tab
 * stop per entry with no nested interactive element inside it, and no
 * `onClick` on a `<div>` — a control that is not a real link cannot be opened
 * in a new tab, cannot be focused and announces nothing.
 *
 * The visible label is the same for every card, which is correct on screen and
 * useless in a list of links, so the accessible name names the entry. The href
 * comes from the shell's builder — the same one the detail page uses for its
 * canonical — so a card can never point at an address the page itself would
 * not claim.
 *
 * Everything else is exactly as S02 delivered it: masonry classes, variable
 * heights, DOM/source order and visible content are untouched. The card
 * renders cover, title and description only — `toGalleryFeedCard` drops the
 * ids, the display order, the indexability flag and the image count at the
 * boundary, so no internal fact can reach here to be rendered by accident, and
 * `APP11-B03` deliberately omits the linked Product from the feed, which is why
 * there is no product lookup, no price, no cart and no buy button.
 */
export function GalleryCard({ card }: { card: GalleryFeedCard }) {
  return (
    <article className="gallery-feed__card">
      <div className="gallery-feed__card-media">
        <GalleryCover coverUrl={card.coverUrl} title={card.title} size={card.coverSize} />
      </div>
      <div className="gallery-feed__card-meta">
        <h2 className="gallery-feed__card-title">{card.title}</h2>
        <p className="gallery-feed__card-description">{card.description}</p>
        <Link
          className="gallery-feed__card-action"
          href={buildStorefrontGalleryDetailPath(card.slug)}
          aria-label={galleryDetailActionLabel(card.title)}
        >
          {GALLERY_COPY.card.detailAction}
        </Link>
      </div>
    </article>
  );
}
