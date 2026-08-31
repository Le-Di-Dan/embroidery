import { GalleryCover } from './gallery-cover';
import type { GalleryFeedCard } from '../model/gallery-feed';

/**
 * One gallery entry in the feed (UI05 Collections Index card: cover, then title,
 * then a short descriptive line).
 *
 * **Deliberately non-interactive.** UI05 draws a text link into the entry's own
 * page, and `353:2` draws hover and pressed treatments for it. That page is
 * `/bo-suu-tap/[slug]`, which `APP11-S03` owns and which does not exist — so
 * this card is an `<article>` with no anchor, no `onClick`, no `tabIndex` and no
 * hover affordance, exactly as `APP2-S01`'s product card was until Product
 * Detail landed. A clickable `div`, a disabled-looking link or an anchor to a
 * 404 would each be worse than the missing affordance: the first two lie about
 * what will happen, and the third breaks.
 *
 * `APP11-S03` adds the route and turns this into a link in the same change, the
 * way `APP2-S02` did for the product card.
 *
 * The card renders cover, title and description only. `toGalleryFeedCard` drops
 * the ids, the display order, the indexability flag and the image count at the
 * boundary, so no internal fact can reach here to be rendered by accident, and
 * `APP11-B03` deliberately omits the linked Product from the feed — which is
 * why there is no product lookup, no price, no cart and no buy button.
 */
export function GalleryCard({ card }: { card: GalleryFeedCard }) {
  return (
    <article className="gallery-feed__card">
      <div className="gallery-feed__card-media">
        <GalleryCover coverUrl={card.coverUrl} title={card.title} />
      </div>
      <div className="gallery-feed__card-meta">
        <h2 className="gallery-feed__card-title">{card.title}</h2>
        <p className="gallery-feed__card-description">{card.description}</p>
      </div>
    </article>
  );
}
