import { PRODUCT_COPY } from '../model/product-copy';

/**
 * The generic media tile.
 *
 * APP2 has no media-delivery contract: `primaryMedia` is identity only, with no
 * URL, and a private original must never be addressed from a browser. So this
 * is a neutral block with an honest accessible description — never an `<img>`,
 * never a URL derived from an asset id, and never a blob request.
 *
 * Real thumbnail delivery is `APP2-T01`, which is routed and not planned for
 * execution; when it ships, this component is the single place that changes.
 */
export function ProductMediaPlaceholder() {
  return (
    <span
      className="product-media"
      role="img"
      aria-label={PRODUCT_COPY.media.placeholder}
      data-testid="product-media-placeholder"
    >
      <span className="product-media__glyph" aria-hidden="true">
        ▣
      </span>
    </span>
  );
}
