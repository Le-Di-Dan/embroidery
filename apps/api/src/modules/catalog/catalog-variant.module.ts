import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductVariantService } from './application/product-variant.service';
import { PRODUCT_VARIANT_REPOSITORY } from './domain/repositories/product-variant.repository';
import { DrizzleProductVariantRepository } from './infrastructure/persistence/drizzle-product-variant.repository';
import { AdminProductVariantController } from './presentation/admin-product-variant.controller';

/**
 * The Admin variant-authoring feature (`APP12-N02.B01`).
 *
 * Kept separate from `CatalogSkuModule` for the reason that module states about
 * `CatalogModule`: a suite that only exercises variant authoring should not
 * have to stand up the SKU service, the order-eligibility rule and the variant
 * lock to do it. The separation is also a boundary rather than a filing
 * decision — the two features hold their locks in opposite orders on purpose
 * (this one locks `products` and stops there; SKU authoring locks the variant
 * and then shares the product), and keeping them apart is what stops a variant
 * write from reaching into the SKU lock.
 *
 * Catalog stays the owner of everything here (CTX-CAT). Nothing in this module
 * depends on Order, Payment, Design, Inventory or Production, and nothing in it
 * knows what stock is: `product_variants` is the definition side, and the one
 * thing this checkpoint changes about the world is that a Ready-Made Product
 * can now be given the structure that makes it sellable at all.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule],
  controllers: [AdminProductVariantController],
  providers: [
    { provide: PRODUCT_VARIANT_REPOSITORY, useClass: DrizzleProductVariantRepository },
    ProductVariantService,
  ],
})
export class CatalogVariantModule {}
