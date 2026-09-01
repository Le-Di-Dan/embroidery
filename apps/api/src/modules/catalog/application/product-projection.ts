/**
 * The safe Admin views of a product draft (`APP2-B02` §8.1/§8.2).
 *
 * The projection is the security boundary for these operations: a field that
 * is not built here cannot reach a browser, however the row was loaded. What is
 * deliberately absent is as much the contract as what is present — no category
 * UUID (the slug is the addressable key), no storage key, bucket, checksum,
 * derivative or inspection evidence, no audit actor, no `is_indexable` or SEO
 * column (those belong to publication, `APP2-B03`/`B04`).
 */
import type {
  ProductDraft,
  ProductDraftMedia,
} from '../domain/repositories/product-draft.repository';

/** The category identity the Admin sees: never the physical row id. */
export interface CategoryView {
  readonly slug: string;
  readonly name: string;
}

/**
 * One selected image, with only the Asset facts B01 already publishes.
 *
 * There is no URL here on purpose: APP2 has no authenticated media-delivery
 * operation, so any address would be fabricated (`FU-APP2-THUMBNAIL-01`).
 */
export interface ProductMediaView {
  readonly assetId: string;
  readonly role: string;
  readonly position: number;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly status: string;
  readonly createdAt: string;
}

export interface ProductSummaryView {
  readonly productId: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly category: CategoryView;
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The first selected image, when one exists; identity only, never a URL. */
  readonly primaryMedia: ProductMediaView | undefined;
}

export interface ProductDetailView extends ProductSummaryView {
  readonly description: string | undefined;
  readonly archivedAt: string | undefined;
  readonly media: readonly ProductMediaView[];
}

export interface ProductListView {
  readonly items: readonly ProductSummaryView[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}

/**
 * Renders a VND amount as whole đồng.
 *
 * The column is `numeric(14,2)`, so PostgreSQL returns `0.00` — but
 * `ck_products__currency_scale` guarantees a VND amount is a whole number, so
 * that fractional part carries no information and every consumer would have to
 * strip it. The scale is only dropped when it is actually all zeros; anything
 * else is passed through untouched rather than silently rounded, and the value
 * stays a string the whole way (`CLAUDE.md` §5).
 */
export function toWholeDong(amount: string): string {
  const match = /^(-?\d+)\.0+$/.exec(amount);
  return match?.[1] ?? amount;
}

function toCategoryView(draft: ProductDraft): CategoryView {
  // Both fields come from the joined `categories` row. The label used to come
  // from a compiled taxonomy instead, on the reasoning that "the row's name is
  // operator-visible content, the taxonomy is the contract" — which inverted
  // the actual authority: a product filed under a category the build did not
  // know rendered as its raw slug. `APP12-C01-C1` made the row the authority
  // for both, so a category the operator adds or renames is named correctly
  // with no deployment.
  return { slug: draft.categorySlug, name: draft.categoryName };
}

export function toMediaView(media: ProductDraftMedia): ProductMediaView {
  return {
    assetId: media.assetId,
    role: media.role,
    position: media.displayOrder,
    mediaType: media.mediaType,
    // `size_bytes` is a `bigint` in the row; JSON has no bigint, and an image
    // size is far inside the safe integer range.
    byteSize: Number(media.byteSize),
    status: media.status,
    createdAt: media.assetCreatedAt.toISOString(),
  };
}

export function toSummaryView(
  product: ProductDraft,
  media: readonly ProductDraftMedia[],
): ProductSummaryView {
  const first = media[0];
  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    category: toCategoryView(product),
    basePriceAmount: toWholeDong(product.basePriceAmount),
    currencyCode: product.currencyCode,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    primaryMedia: first === undefined ? undefined : toMediaView(first),
  };
}

export function toDetailView(
  product: ProductDraft,
  media: readonly ProductDraftMedia[],
): ProductDetailView {
  return {
    ...toSummaryView(product, media),
    description: product.description,
    archivedAt: product.archivedAt?.toISOString(),
    media: media.map(toMediaView),
  };
}
