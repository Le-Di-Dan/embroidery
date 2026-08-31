import Link from 'next/link';

import { type DiscoverCard } from '../../product-discovery';
import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import { HOMEPAGE_COPY } from '../model/homepage-copy';

/**
 * One work on the Homepage — image, then title, then category, the whole card a
 * single link (the UI02 `StudioWorkCard` language, `APP2-S02`/IMP-D039).
 *
 * It is a Homepage component rather than a direct reuse of
 * `product-discovery`'s `ProductCard` for one reason, and it is a semantic one:
 * that card titles itself with an `<h2>`, correct on `/kham-pha` where the page
 * `<h1>` is "Khám phá" and the cards are the page's own top-level content. Here
 * the `<h2>` level is already taken by the six section headings, so a card must
 * title itself at `<h3>` or the document outline reads as though every artwork
 * were a peer of "Câu chuyện của xưởng". The data projection, the route builder
 * and the visual language are all shared; only the heading level differs.
 *
 * The path comes from the shell's builder — never composed from a product id —
 * so a Homepage card can never point at an address the detail page would not
 * claim. Nothing else about the product is exposed: `toDiscoverCard` has already
 * dropped price and stock, and storage keys, buckets, private media URLs and
 * publication status are not on the public summary at all.
 */
export function HomepageWorkCard({ card }: { card: DiscoverCard }) {
  return (
    <Link className="homepage-work" href={buildStorefrontProductDetailPath(card.slug)}>
      <div className="homepage-work__media">
        {card.thumbnailUrl === undefined ? (
          <div
            className="homepage-work__placeholder"
            role="img"
            aria-label={HOMEPAGE_COPY.works.imageMissing}
          />
        ) : (
          // A plain <img>, matching `APP2-S01`: the thumbnail is served by the
          // publication-gated API route (`no-store`, publication re-checked per
          // request), and `next/image` would demand intrinsic dimensions the
          // public contract does not expose — inventing a ratio would crop every
          // artwork to it, which is what an image-led surface must not do.
          // A single image that fails to load degrades to its own alt text and
          // takes nothing else on the page with it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="homepage-work__image"
            src={card.thumbnailUrl}
            alt={card.name}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div className="homepage-work__meta">
        <h3 className="homepage-work__title">{card.name}</h3>
        <p className="homepage-work__category">{card.categoryName}</p>
      </div>
    </Link>
  );
}
