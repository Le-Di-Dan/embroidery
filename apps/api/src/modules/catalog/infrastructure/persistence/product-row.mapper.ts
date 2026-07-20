/**
 * Row → domain mapping for the AGG-05/AGG-06 catalog aggregates.
 *
 * The single boundary at which a catalog row becomes a domain object.
 * Money stays a string all the way through: `numeric` must never be turned
 * into a JavaScript number (`CLAUDE.md` §5, ADR-DB1 money model).
 */
import type { ProductState, schema } from '@embroidery/database';

import type {
  Category,
  CategoryId,
  EmbroideryArea,
  Product,
  ProductSide,
  ProductVariant,
  Sku,
} from '../../domain/repositories/product.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
  ProductVariantId,
  SkuId,
} from '../../domain/repositories/placement-hierarchy.port';

export type CategoryRow = typeof schema.categories.$inferSelect;
export type ProductRow = typeof schema.products.$inferSelect;
export type VariantRow = typeof schema.productVariants.$inferSelect;
export type SkuRow = typeof schema.skus.$inferSelect;
export type SideRow = typeof schema.productSides.$inferSelect;
export type AreaRow = typeof schema.embroideryAreas.$inferSelect;

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id as CategoryId,
    name: row.name,
    slug: row.slug,
    status: row.status as ProductState,
  };
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id as ProductId,
    categoryId: row.categoryId as CategoryId,
    name: row.name,
    slug: row.slug,
    basePriceAmount: row.basePriceAmount,
    currencyCode: row.currencyCode,
    status: row.status as ProductState,
    displayOrder: row.displayOrder,
  };
}

export function toVariant(row: VariantRow): ProductVariant {
  return {
    id: row.id as ProductVariantId,
    productId: row.productId as ProductId,
    colorName: row.colorName ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    isActive: row.isActive,
  };
}

export function toSku(row: SkuRow): Sku {
  return {
    id: row.id as SkuId,
    productVariantId: row.productVariantId as ProductVariantId,
    code: row.code,
    priceOverrideAmount: row.priceOverrideAmount ?? undefined,
    isActive: row.isActive,
  };
}

export function toSide(row: SideRow): ProductSide {
  return {
    id: row.id as ProductSideId,
    productId: row.productId as ProductId,
    name: row.name,
    backgroundAssetId: row.backgroundAssetId,
  };
}

export function toArea(row: AreaRow): EmbroideryArea {
  return {
    id: row.id as EmbroideryAreaId,
    productSideId: row.productSideId as ProductSideId,
    name: row.name,
  };
}
