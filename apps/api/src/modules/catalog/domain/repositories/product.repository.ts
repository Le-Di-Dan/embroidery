/**
 * AGG-05 Category and AGG-06 Product persistence contracts
 * (TBL-011..TBL-017).
 *
 * A Product owns its variants, SKUs, sides, areas and media associations. They
 * are children, not aggregates: a variant of no product is not a thing the
 * model allows, so none of them has a repository of its own (DB7 §10.1).
 */
import type { ProductState } from '@embroidery/database';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
  SkuId,
} from './placement-hierarchy.port';

export type CategoryId = string & { readonly __brand: 'CategoryId' };

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly slug: string;
  readonly status: ProductState;
}

export interface Product {
  readonly id: ProductId;
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly slug: string;
  /** Minor units (VND has scale 0). Never a float — `CLAUDE.md` §5. */
  readonly basePriceAmount: string;
  readonly currencyCode: string;
  readonly status: ProductState;
  readonly displayOrder: number;
}

export interface ProductVariant {
  readonly id: ProductVariantId;
  readonly productId: ProductId;
  readonly colorName: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly isActive: boolean;
}

export interface Sku {
  readonly id: SkuId;
  readonly productVariantId: ProductVariantId;
  readonly code: string;
  readonly priceOverrideAmount: string | undefined;
  readonly isActive: boolean;
}

export interface ProductSide {
  readonly id: ProductSideId;
  readonly productId: ProductId;
  readonly name: string;
  readonly backgroundAssetId: string;
}

export interface EmbroideryArea {
  readonly id: EmbroideryAreaId;
  readonly productSideId: ProductSideId;
  readonly name: string;
}

/** A product with its children, fetched one round trip per child table. */
export interface ProductStructure {
  readonly product: Product;
  readonly variants: readonly ProductVariant[];
  readonly skus: readonly Sku[];
  readonly sides: readonly ProductSide[];
  readonly areas: readonly EmbroideryArea[];
}

export interface CreateProductInput {
  readonly id: ProductId;
  readonly categoryId: CategoryId;
  readonly name: string;
  readonly slug: string;
  readonly basePriceAmount: string;
  readonly displayOrder: number;
}

export interface AddVariantInput {
  readonly id: ProductVariantId;
  readonly productId: ProductId;
  readonly colorName?: string | undefined;
  readonly sizeLabel?: string | undefined;
  readonly displayOrder: number;
}

export interface AddSkuInput {
  readonly id: SkuId;
  readonly productVariantId: ProductVariantId;
  readonly code: string;
  readonly priceOverrideAmount?: string | undefined;
}

export interface AddSideInput {
  readonly id: ProductSideId;
  readonly productId: ProductId;
  /**
   * Stable machine identity within the Product (`APP3-DB01`, IMP-D041 PO-07).
   *
   * Required, because the column is `NOT NULL`: a referenced placement is never
   * edited in place, so what a Template or Session *means* has to survive its
   * replacement, and `name` cannot carry that — it is display copy.
   */
  readonly code: string;
  readonly name: string;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly pxPerMm: string;
  readonly displayOrder: number;
}

export interface AddAreaInput {
  readonly id: EmbroideryAreaId;
  readonly productSideId: ProductSideId;
  /** Stable machine identity within the Side; see `AddSideInput.code`. */
  readonly code: string;
  readonly name: string;
  readonly boundXPx: string;
  readonly boundYPx: string;
  readonly boundWidthPx: string;
  readonly boundHeightPx: string;
  readonly displayOrder: number;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface CategoryRepository {
  /** @requiresTransaction */
  create(input: {
    id: CategoryId;
    name: string;
    slug: string;
    displayOrder: number;
  }): Promise<Category>;
  /** @requiresTransaction */
  changeStatus(id: CategoryId, status: ProductState): Promise<Category>;
  findBySlug(slug: string): Promise<Category | undefined>;
  /**
   * The same lookup, with the row locked `FOR SHARE` for the rest of the
   * transaction (`APP12-C02`).
   *
   * Share mode, because a Product write only needs the category to *stay as it
   * is* until commit — an exclusive lock would serialise every draft creation in
   * a category against every other. What it does exclude is the one writer that
   * takes the row `FOR UPDATE`: `AdminCategoryRepository.lockById`, behind the
   * archive transition. That is what makes "a Product was filed under a category
   * that was being archived" impossible rather than merely unlikely, and it is
   * the same seam `DrizzleProductPublicationRepository.lockSnapshot` already
   * uses on the publish path.
   *
   * @requiresTransaction
   */
  lockBySlug(slug: string): Promise<Category | undefined>;
  findById(id: CategoryId): Promise<Category | undefined>;
}

export interface ProductRepository {
  /** @requiresTransaction */
  create(input: CreateProductInput): Promise<Product>;
  /** @requiresTransaction */
  addVariant(input: AddVariantInput): Promise<ProductVariant>;
  /** @requiresTransaction */
  addSku(input: AddSkuInput): Promise<Sku>;
  /** @requiresTransaction */
  addSide(input: AddSideInput): Promise<ProductSide>;
  /** @requiresTransaction — the area's side must belong to the same product. */
  addArea(input: AddAreaInput): Promise<EmbroideryArea>;
  /** @requiresTransaction */
  attachMedia(input: { productId: ProductId; assetId: string; role: string }): Promise<void>;
  /** @requiresTransaction */
  changeStatus(id: ProductId, status: ProductState): Promise<Product>;

  findById(id: ProductId): Promise<Product | undefined>;
  findBySlug(slug: string): Promise<Product | undefined>;

  /** Loads the product and its children in one round trip per child table. */
  loadStructure(id: ProductId): Promise<ProductStructure | undefined>;

  findSkuByCode(code: string): Promise<Sku | undefined>;
}
