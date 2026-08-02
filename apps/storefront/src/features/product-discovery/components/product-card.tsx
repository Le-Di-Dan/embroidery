import Link from 'next/link';

import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import { DISCOVER_COPY, thumbnailAlt } from '../model/discover-copy';
import type { DiscoverCard } from '../model/discover-feed';

/**
 * One artwork in the Discover feed (UI02 `StudioWorkCard`: artwork image, then
 * title, then category).
 *
 * **The whole card is one link** (`APP2-S02`, IMP-D039). It was a deliberately
 * non-interactive `<article>` under IMP-D038 because no Product Detail route
 * existed; `/san-pham/[slug]` now does, so the link the design always implied is
 * real. Exactly one anchor wraps image, name and category — a generous hit area
 * with no second control nested inside it, and one Tab stop per artwork rather
 * than three.
 *
 * The path comes from the shell's builder, the same one the detail page uses for
 * its canonical and share URLs, so a card can never point at an address the page
 * itself would not claim.
 *
 * Everything else is untouched: masonry classes, variable heights, source order
 * and visible content are exactly as `APP2-S01` delivered them. The card renders
 * name, category and image only — `toDiscoverCard` drops price and the
 * out-of-stock flag at the boundary, because UI02 is image-led discovery rather
 * than a shop listing.
 */
export function ProductCard({ card }: { card: DiscoverCard }) {
  return (
    <Link className="discover__card" href={buildStorefrontProductDetailPath(card.slug)}>
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
    </Link>
  );
}
