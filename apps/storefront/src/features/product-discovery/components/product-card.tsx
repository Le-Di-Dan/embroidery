import { DISCOVER_COPY, thumbnailAlt } from '../model/discover-copy';
import type { DiscoverCard } from '../model/discover-feed';

/**
 * One artwork in the Discover feed (UI02 `StudioWorkCard`: artwork image, then
 * title, then category).
 *
 * **Deliberately non-interactive** (IMP-D038). No `href`, no click handler, no
 * button role, no pointer cursor and no hover affordance: the Product Detail
 * browser route is unresolved, so a card that looked clickable would either lead
 * nowhere or invent a route the Product Owner has not approved. This is accepted
 * authority, not an unfinished card — `APP2-S02` may wrap this same markup in a
 * link once the UI03 reconciliation supplies a destination, without touching the
 * masonry.
 *
 * The card renders name, category and image only. Price and the out-of-stock
 * flag never reach it: `toDiscoverCard` drops them at the boundary, because UI02
 * is image-led discovery rather than a shop listing.
 */
export function ProductCard({ card }: { card: DiscoverCard }) {
  return (
    <article className="discover__card">
      <div className="discover__card-media">
        {card.thumbnailUrl === undefined ? (
          <div
            className="discover__card-placeholder"
            role="img"
            aria-label={DISCOVER_COPY.card.imageMissing}
          />
        ) : (
          // A plain <img>, not next/image: the thumbnail is served by the
          // publication-gated API route, which re-checks publication on every
          // request and is `no-store`. next/image would also demand intrinsic
          // dimensions, and `APP2-B04` exposes none — supplying them would mean
          // inventing a ratio and cropping every artwork to it, which is exactly
          // what UI02's variable-height masonry must not do.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="discover__card-image"
            src={card.thumbnailUrl}
            alt={thumbnailAlt(card.name)}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div className="discover__card-meta">
        <h2 className="discover__card-title">{card.name}</h2>
        <p className="discover__card-category">{card.categoryName}</p>
      </div>
    </article>
  );
}
