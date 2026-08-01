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

/**
 * Narrows a persisted role to the public vocabulary.
 *
 * `DETAIL` exists in the database's closed role set but nothing writes it
 * (`APP2-B02` uses `THUMBNAIL` + `GALLERY`). Mapping an unexpected role to
 * `GALLERY` rather than leaking the literal keeps the wire contract closed if a
 * later checkpoint starts writing one.
 */
export function toPublicMediaRole(role: string): PublicMediaRole {
  return role === 'THUMBNAIL' ? 'THUMBNAIL' : 'GALLERY';
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
          },
        }),
  };
}

export function toPublicMediaReference(
  slug: string,
  media: PublicProductDetailMediaRow,
): PublicMediaReference {
  return {
    url: publicProductMediaPath({
      slug,
      productMediaId: media.productMediaId,
      rendition: PUBLIC_DETAIL_RENDITION,
    }),
    role: toPublicMediaRole(media.role),
  };
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
    // Repository order is the persisted display order; the projection preserves
    // it rather than re-sorting on anything the client can see.
    media: detail.media.map((row) => toPublicMediaReference(product.slug, row)),
    seo: {
      ...(product.seoTitle === undefined ? {} : { title: product.seoTitle }),
      ...(product.seoDescription === undefined ? {} : { description: product.seoDescription }),
      isIndexable: product.isIndexable,
    },
  };
}
