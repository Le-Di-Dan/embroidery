import { DISCOVER_COPY } from '../model/discover-copy';
import type { DiscoverCard } from '../model/discover-feed';
import { ProductCard } from './product-card';

/**
 * The variable-height masonry (UI02: 5 columns desktop, 3 tablet, 2 mobile).
 *
 * One semantic collection and one card tree. The columns are produced by CSS
 * multi-column (`columns` + `break-inside: avoid`), which is the narrowest
 * approach that keeps **source order linear**: the browser distributes the same
 * single `<ul>` across columns at paint time, so assistive technology and
 * "view source" both read the products in the order the server returned them.
 *
 * The alternative — slicing the list into per-column arrays in JavaScript —
 * would reorder the DOM to match the visual layout and is what the linear-DOM
 * invariant forbids. There is no masonry dependency and no duplicated
 * per-viewport tree; one list serves every breakpoint.
 *
 * Card heights vary because the images do: UI02's cards run from ~298px to
 * ~825px tall, and `APP2-B04` publishes no derivative dimensions, so each image
 * renders at its own natural ratio rather than being cropped to a uniform box.
 */
export function ProductMasonry({ cards }: { cards: readonly DiscoverCard[] }) {
  return (
    <ul className="discover__masonry" aria-label={DISCOVER_COPY.feedLabel}>
      {cards.map((card) => (
        <li key={card.slug} className="discover__masonry-item">
          <ProductCard card={card} />
        </li>
      ))}
    </ul>
  );
}
