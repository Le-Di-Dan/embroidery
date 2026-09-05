import { ReadyMadePurchasePanel, type ReadyMadePurchaseResult } from '../../ready-made-purchase';
import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import type { ProductDetailView } from '../model/product-detail-view';
import { DetailBreadcrumb } from './detail-breadcrumb';
import { DetailContinueDiscover } from './detail-continue-discover';
import { DetailGallery } from './detail-gallery';
import { DetailShareButton } from './detail-share-button';
import { DetailStory } from './detail-story';

/**
 * The Product Detail composition (`529:2225` / `529:2431` / `529:2575`).
 *
 * A Server Component. Only the gallery and Share are client islands, so the
 * Product's name, category, first image and description are all in the
 * server-rendered HTML — which is what makes the page indexable and readable
 * before any JavaScript arrives.
 *
 * No `<main>`, no header, no footer and no skip link: the root layout's shell
 * already provides all four, and a second one would duplicate the landmark that
 * assistive technology uses to skip straight to content.
 *
 * The category is rendered as identity, not as a control. The breadcrumb and the
 * continuation section are where a visitor navigates by category; a chip that
 * also filtered would give the same destination two different-looking doors.
 *
 * ## The hero is a two-column purchase decision at 1024 and above
 *
 * `APP12-S01` placed the purchase panel as a sibling in the approved single
 * centred column (`902:4` / `905:67` / `905:187`). That composition is
 * superseded by `APP12-V02` §12.
 *
 * `V01-UX-002` measured what it produced at 1440×900: the `h1` began at
 * y=1045, the price below it, and the panel's primary action at y=1494. Above
 * the fold there were **70 visible characters**, a breadcrumb and one 1152×662
 * image. The page answered none of "what is this", "what does it cost", "is it
 * available" and "which one am I buying" until the customer had scrolled a
 * full screen — on every Product, which is what made it the most expensive
 * composition decision in the audit.
 *
 * So the media and the decision are now siblings inside one `__hero`. It stacks
 * below 1024 exactly as it did before and becomes two columns at and above it.
 * The DOM order is media → identity → purchase → share at every width, so the
 * stacked order *is* the reading order and the grid moves nothing a keyboard or
 * a screen reader can perceive.
 *
 * Share moves to the foot of the decision column. It sat between the name and
 * the purchase panel, which put the page's lowest-consequence action in the
 * middle of its highest-consequence one (`V01-UX-003`).
 *
 * The approved frames draw the single column, and are superseded for the
 * runtime under §33: runtime quality is primary, and here the approved
 * composition is the defect.
 */
export function ProductDetailScreen({
  product,
  purchase,
}: {
  readonly product: ProductDetailView;
  readonly purchase: ReadyMadePurchaseResult;
}) {
  return (
    <article className="product-detail">
      <DetailBreadcrumb
        name={product.name}
        categoryName={product.categoryName}
        categorySlug={product.categorySlug}
      />

      <div className="product-detail__hero">
        <DetailGallery media={product.media} name={product.name} />

        <div className="product-detail__decision">
          <div className="product-detail__identity">
            <p className="product-detail__category">{product.categoryName}</p>
            <h1 className="product-detail__title">{product.name}</h1>
          </div>

          <ReadyMadePurchasePanel
            slug={product.slug}
            basePrice={product.price}
            purchase={purchase}
          />

          <DetailShareButton
            name={product.name}
            path={buildStorefrontProductDetailPath(product.slug)}
            {...(product.description === undefined ? {} : { description: product.description })}
          />
        </div>
      </div>

      {product.description === undefined ? null : <DetailStory description={product.description} />}

      <DetailContinueDiscover
        categoryName={product.categoryName}
        categorySlug={product.categorySlug}
      />
    </article>
  );
}
