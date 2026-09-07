/**
 * Turns internal catalog rows into the two public payloads (`APP2-B04`).
 *
 * This is the boundary where internal identity stops. A row arriving here
 * carries `products.id` (the keyset tie-breaker) and `product_media.id` (the
 * delivery address); a value leaving here carries neither as a field. The
 * association id survives only *inside* a media path, which is the one place
 * `APP2-T01` authorises it — as an opaque route identity that grants nothing,
 * never as a standalone property a client could collect.
 *
 * Pure functions, no injection, no I/O: every rule below is decidable from its
 * arguments, which is what lets the leak scan in the unit suite enumerate real
 * projections rather than reason about the code that builds them.
 */
import { publicProductMediaPath } from '../domain/public-product-catalog-path';
import type { PublicMediaIntrinsicSize } from '../domain/public-media-dimensions';
import {
  PUBLIC_DETAIL_RENDITION,
  PUBLIC_LIST_RENDITION,
} from '../domain/public-product-catalog.policy';
import type {
  PublicProductDetail,
  PublicProductDetailMediaRow,
  PublicProductListRow,
} from '../domain/repositories/public-product.repository';
import { toWholeDong } from './product-projection';

/** The closed public media role vocabulary (`APP2-B02` writes exactly these). */
export type PublicMediaRole = 'THUMBNAIL' | 'GALLERY';

export interface PublicMediaReference {
  /** Relative application path served by the `APP2-T01` route. */
  readonly url: string;
  readonly role: PublicMediaRole;
  /**
   * Intrinsic pixel width of the derivative `url` addresses (`APP12-H05-C1`).
   *
   * Present with {@link height} or absent with it — never one alone, and never
   * a guess. Absent means the stored derivative carries no dimensions, which is
   * a legitimate historical state; a consumer then renders exactly as it did
   * before rather than reserving a fabricated box.
   */
  readonly width?: number;
  /** Intrinsic pixel height of that same derivative. See {@link width}. */
  readonly height?: number;
  /**
   * The **same association** at the small rendition (`APP12-M01-B1` §5).
   *
   * `url` above addresses the `catalog-preview` derivative, which is right for
   * a large preview and wrong for a 64 px control: `APP12-H05` measured the
   * Product Detail strip pulling 1 600 px sources into it, and `M01.A` measured
   * what that costs once a product may own twenty images — 6.63 MB of first
   * render against 1.76 MB. Both renditions have always been servable for any
   * association id by the one `APP2-T01` route; this publishes the address that
   * was already resolvable and never stated.
   *
   * Absent only when the `THUMBNAIL` derivative is not itself deliverable. A
   * consumer then falls back to {@link url} for that one item rather than
   * losing the image.
   */
  readonly thumbnailUrl?: string;
  /** Intrinsic width of the derivative {@link thumbnailUrl} addresses. Pairs with {@link thumbnailHeight}. */
  readonly thumbnailWidth?: number;
  /** Intrinsic height of that same derivative. See {@link thumbnailWidth}. */
  readonly thumbnailHeight?: number;
}

export interface PublicProductSummary {
  readonly slug: string;
  readonly name: string;
  readonly category: PublicCategory;
  readonly price: PublicPrice;
  readonly isDisplayOutOfStock: boolean;
  /** Absent when this product has no deliverable thumbnail. */
  readonly thumbnail?: PublicMediaReference;
}

export interface PublicCategory {
  readonly slug: string;
  readonly name: string;
}

export interface PublicPrice {
  /** Whole đồng as a decimal string. Never a JavaScript number. */
  readonly amount: string;
  readonly currency: string;
}

export interface PublicProductDetailView {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly category: PublicCategory;
  readonly price: PublicPrice;
  readonly isDisplayOutOfStock: boolean;
  readonly media: readonly PublicMediaReference[];
  readonly seo: PublicProductSeo;
}

/**
 * Only the SEO facts that physically exist on `products` (`seo_title`,
 * `seo_description`, `is_indexable`). No canonical URL and no social image: the
 * first is a Storefront routing decision nobody has made, and the second has no
 * column. `APP2-B03` deliberately excluded all three from publication
 * readiness, so any of them may legitimately be absent on a published product.
 */
export interface PublicProductSeo {
  readonly title?: string;
  readonly description?: string;
  readonly isIndexable: boolean;
}

export function toPublicPrice(amount: string, currency: string): PublicPrice {
  return { amount: toWholeDong(amount), currency };
}

export function toPublicProductSummary(row: PublicProductListRow): PublicProductSummary {
  return {
    slug: row.slug,
    name: row.name,
    category: { slug: row.categorySlug, name: row.categoryName },
    price: toPublicPrice(row.basePriceAmount, row.currencyCode),
    isDisplayOutOfStock: row.isDisplayOutOfStock,
    // Omitted rather than nulled when there is no deliverable thumbnail: a
    // fabricated address would 404 at the delivery route, and an address that
    // is known not to resolve is worse than no address at all.
    ...(row.thumbnailProductMediaId === undefined
      ? {}
      : {
          thumbnail: {
            url: publicProductMediaPath({
              slug: row.slug,
              productMediaId: row.thumbnailProductMediaId,
              rendition: PUBLIC_LIST_RENDITION,
            }),
            role: 'THUMBNAIL',
            ...toPublicMediaSize(row.thumbnailSize),
          },
        }),
  };
}

/**
 * One media item of the detail payload.
 *
 * `position` decides the published `role`, not the stored column
 * (`APP12-M01-B1` §6). The repository hands these rows back in
 * `PUBLIC_EFFECTIVE_PRIMARY_ORDER`, so index 0 *is* the effective primary — and
 * saying `THUMBNAIL` there is what makes the detail array agree with the card,
 * `og:image` and the JSON-LD list on a product whose stored primary has become
 * undeliverable. In the healthy case the two derivations produce the same
 * answer, because the stored `THUMBNAIL` is also the row that sorts first.
 */
export function toPublicMediaReference(
  slug: string,
  media: PublicProductDetailMediaRow,
  position: number,
): PublicMediaReference {
  return {
    url: publicProductMediaPath({
      slug,
      productMediaId: media.productMediaId,
      rendition: PUBLIC_DETAIL_RENDITION,
    }),
    role: position === 0 ? 'THUMBNAIL' : 'GALLERY',
    ...toPublicMediaSize(media.size),
    // Omitted whole rather than nulled, exactly as the size pair is: an address
    // that is known not to resolve is worse than no address at all.
    ...(media.thumbnailAvailable
      ? {
          thumbnailUrl: publicProductMediaPath({
            slug,
            productMediaId: media.productMediaId,
            rendition: PUBLIC_LIST_RENDITION,
          }),
          ...toPublicThumbnailSize(media.thumbnailSize),
        }
      : {}),
  };
}

/**
 * The thumbnail size pair, under its own field names.
 *
 * A separate helper from {@link toPublicMediaSize} because the two describe
 * different derivatives and must never be spread from the same value — the
 * whole point of publishing both is that a client can reserve the right box for
 * each, and one substituted for the other would reserve a 1 250 px box for a
 * 480 px image.
 */
export function toPublicThumbnailSize(
  size: PublicMediaIntrinsicSize | undefined,
): { thumbnailWidth: number; thumbnailHeight: number } | Record<string, never> {
  return size === undefined ? {} : { thumbnailWidth: size.width, thumbnailHeight: size.height };
}

/**
 * Spreads an intrinsic size onto a media reference, or contributes nothing.
 *
 * Omitted rather than nulled, for the same reason `thumbnail` itself is: a
 * consumer reading `width: null` has to decide what that means, while a
 * consumer reading no field at all simply has no size and renders as it always
 * did. The pair moves together and cannot be half-applied.
 */
export function toPublicMediaSize(
  size: PublicMediaIntrinsicSize | undefined,
): PublicMediaIntrinsicSize | Record<string, never> {
  return size === undefined ? {} : { width: size.width, height: size.height };
}

export function toPublicProductDetail(detail: PublicProductDetail): PublicProductDetailView {
  const { product } = detail;
  return {
    slug: product.slug,
    name: product.name,
    ...(product.description === undefined ? {} : { description: product.description }),
    category: { slug: product.categorySlug, name: product.categoryName },
    price: toPublicPrice(product.basePriceAmount, product.currencyCode),
    isDisplayOutOfStock: product.isDisplayOutOfStock,
    // Repository order is `PUBLIC_EFFECTIVE_PRIMARY_ORDER`; the projection
    // preserves it rather than re-sorting on anything the client can see, which
    // is what lets index 0 carry the effective-primary designation.
    media: detail.media.map((row, position) => toPublicMediaReference(product.slug, row, position)),
    seo: {
      ...(product.seoTitle === undefined ? {} : { title: product.seoTitle }),
      ...(product.seoDescription === undefined ? {} : { description: product.seoDescription }),
      isIndexable: product.isIndexable,
    },
  };
}
