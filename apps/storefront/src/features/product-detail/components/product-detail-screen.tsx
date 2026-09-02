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
 * `APP12-S01` adds exactly one child: the Ready-Made purchase panel, placed
 * after the identity group and before the story, as `902:4` / `905:67` /
 * `905:187` draw it. Nothing else moved. The media hierarchy, the breadcrumb,
 * the category chip, Share, the 640 story measure and the continuation section
 * are labelled `UNCHANGED` in those frames and are unchanged here — the panel is
 * a sibling in the same centred column, not a buy box that restructures the
 * hero into a two-column commerce layout.
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

      <DetailGallery media={product.media} name={product.name} />

      <div className="product-detail__identity">
        <p className="product-detail__category">{product.categoryName}</p>
        <h1 className="product-detail__title">{product.name}</h1>
        <DetailShareButton
          name={product.name}
          path={buildStorefrontProductDetailPath(product.slug)}
          {...(product.description === undefined ? {} : { description: product.description })}
        />
      </div>

      <ReadyMadePurchasePanel slug={product.slug} basePrice={product.price} purchase={purchase} />

      {product.description === undefined ? null : <DetailStory description={product.description} />}

      <DetailContinueDiscover
        categoryName={product.categoryName}
        categorySlug={product.categorySlug}
      />
    </article>
  );
}
