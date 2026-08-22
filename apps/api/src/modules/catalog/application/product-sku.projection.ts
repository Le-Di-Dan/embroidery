/**
 * The Admin SKU view (`APP7-B01`).
 *
 * Kept apart from the OpenAPI response classes for the same reason `APP2-B02`
 * keeps them apart: adding a property to one and forgetting the other shows up
 * as a type error instead of as a silently undocumented field.
 *
 * `variantOrderEligibleSkuCount` is the fact the whole checkpoint exists to
 * make reachable — it is what tells an operator whether the variant now
 * resolves to exactly one sellable SKU. It is a **count**, never an id: naming
 * "the" eligible SKU here would be a resolution, and resolution belongs to
 * `APP7-W01`, which reads the database under its own lock.
 */
import type { SkuRecord } from '../domain/repositories/product-sku.repository';
import { SKU_CURRENCY } from '../domain/product-sku.policy';

export interface AdminSkuView {
  readonly skuId: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly code: string;
  /** Absent when the SKU has no override and the product base price applies. */
  readonly priceOverrideAmount?: string;
  readonly currencyCode: string;
  /** COL-TBL014-05, the sellable flag: `true` means order-eligible. */
  readonly isActive: boolean;
  readonly variantOrderEligibleSkuCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toAdminSkuView(input: {
  readonly sku: SkuRecord;
  readonly productId: string;
  readonly eligibleCount: number;
}): AdminSkuView {
  return {
    skuId: input.sku.id,
    productId: input.productId,
    productVariantId: input.sku.productVariantId,
    code: input.sku.code,
    ...(input.sku.priceOverrideAmount === undefined
      ? {}
      : { priceOverrideAmount: input.sku.priceOverrideAmount }),
    currencyCode: SKU_CURRENCY,
    isActive: input.sku.isActive,
    variantOrderEligibleSkuCount: input.eligibleCount,
    createdAt: input.sku.createdAt.toISOString(),
    updatedAt: input.sku.updatedAt.toISOString(),
  };
}
