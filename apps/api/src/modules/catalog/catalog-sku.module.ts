import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductSkuService } from './application/product-sku.service';
import { PRODUCT_SKU_REPOSITORY } from './domain/repositories/product-sku.repository';
import { DrizzleProductSkuRepository } from './infrastructure/persistence/drizzle-product-sku.repository';
import { AdminSkuController } from './presentation/admin-sku.controller';

/**
 * The Admin SKU-authoring feature (`APP7-B01`).
 *
 * Kept separate from `CatalogDraftModule` for the reason that module states
 * about `CatalogModule`: a suite that only exercises SKU authoring should not
 * have to stand up the draft query, the media selection and the Asset port to
 * do it. It deliberately does **not** import `CatalogModule` either — the DB7
 * `ProductRepository` is the structure builder and this feature needs the
 * locking port instead.
 *
 * Catalog stays the owner of everything here (CTX-CAT). Nothing in this module
 * depends on Order, Payment, Design, Inventory or Production, and nothing in it
 * knows what an order is: it makes the Catalog order-item branch *legally
 * reachable* by making "exactly one order-eligible SKU per variant" an
 * achievable and enforced state. Resolving a SKU for an order belongs to
 * `APP7-W01`.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule],
  controllers: [AdminSkuController],
  providers: [
    { provide: PRODUCT_SKU_REPOSITORY, useClass: DrizzleProductSkuRepository },
    ProductSkuService,
  ],
})
export class CatalogSkuModule {}
