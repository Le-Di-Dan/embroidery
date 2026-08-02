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
 */
export function ProductDetailScreen({ product }: { product: ProductDetailView }) {
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

      {product.description === undefined ? null : <DetailStory description={product.description} />}

      <DetailContinueDiscover
        categoryName={product.categoryName}
        categorySlug={product.categorySlug}
      />
    </article>
  );
}
