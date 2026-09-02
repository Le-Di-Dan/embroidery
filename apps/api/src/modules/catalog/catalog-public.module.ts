import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { SkuAvailabilitySnapshotModule } from '../inventory/sku-availability-snapshot.module';

import { PUBLIC_CATEGORY_REPOSITORY } from './domain/repositories/public-category.repository';
import { PUBLIC_PRODUCT_REPOSITORY } from './domain/repositories/public-product.repository';
import { PUBLIC_PRODUCT_VARIANT_REPOSITORY } from './domain/repositories/public-product-variant.repository';
import { DrizzlePublicCategoryRepository } from './infrastructure/persistence/drizzle-public-category.repository';
import { DrizzlePublicProductRepository } from './infrastructure/persistence/drizzle-public-product.repository';
import { DrizzlePublicProductVariantRepository } from './infrastructure/persistence/drizzle-public-product-variant.repository';
import { PublicCategoryQuery } from './application/public-category.query';
import { PublicProductQuery } from './application/public-product.query';
import { PublicProductVariantQuery } from './application/public-product-variant.query';
import { PublicCategoryController } from './presentation/public-category.controller';
import { PublicProductController } from './presentation/public-product.controller';
import { PublicProductVariantController } from './presentation/public-product-variant.controller';

/**
 * `APP2-B04` — the public catalog queries, extended by `APP5-B07`.
 *
 * Its own module, alongside `CatalogPublicMediaModule` rather than inside it:
 * the two share a base path but not a concern, and separating them means the
 * JSON queries stand up a database and nothing else. In particular this graph
 * has **no object-storage provider** — none of these operations touches bytes,
 * and not wiring the port is a stronger guarantee of that than a test asserting
 * they do not.
 *
 * Deliberately absent: every Admin provider. `CatalogDraftModule` and
 * `CatalogPublicationModule` carry authentication, the Origin allowlist and
 * audit wiring; a public read has no business sharing a graph with them.
 *
 * `APP5-B07`'s variant selection read joins this module rather than starting a
 * new one. It is the same concern by every measure that put the other two here —
 * an anonymous JSON read of published Catalog data, resolved by product slug,
 * needing a database and nothing else — and a module per public read would
 * multiply graphs without separating anything. It is a *Catalog* read despite
 * being consumed by APP5: Ordering must not own a query over `product_variants`
 * (`BACKEND_CONVENTIONS.md` §10), and the module that already owns the public
 * visibility predicate is the one place it cannot drift from.
 *
 * `APP12-C01`'s category inventory joins on the same terms, and adds one of its
 * own: the taxonomy it lists is the taxonomy the Product category filter here
 * resolves against. Two modules would be two places where "which categories are
 * public" is decided, and the day one changed the Storefront would offer a
 * filter chip the other read answers with nothing. Its **write** side stays
 * deliberately elsewhere — `CATEGORY_REPOSITORY`, which creates rows and
 * changes status, belongs to `CatalogModule` and is not wired here, so no route
 * in this graph can mutate a category.
 *
 * `APP12-B01` adds `SkuAvailabilitySnapshotModule` — one read-only Inventory
 * port and nothing else. Not `InventoryModule`, which re-exports
 * `InventoryPersistenceModule` and would put `createSoftHold`,
 * `createReservation`, `ensureStockRow` and `adjust` inside a graph of
 * anonymous public GETs. What this module gains is a method that returns
 * numbers, so "a public catalog read reserves nothing and provisions nothing" is
 * a property of the wiring rather than of a query's restraint.
 */
@Module({
  imports: [DatabaseModule, SkuAvailabilitySnapshotModule],
  controllers: [PublicProductController, PublicProductVariantController, PublicCategoryController],
  providers: [
    { provide: PUBLIC_PRODUCT_REPOSITORY, useClass: DrizzlePublicProductRepository },
    {
      provide: PUBLIC_PRODUCT_VARIANT_REPOSITORY,
      useClass: DrizzlePublicProductVariantRepository,
    },
    { provide: PUBLIC_CATEGORY_REPOSITORY, useClass: DrizzlePublicCategoryRepository },
    PublicProductQuery,
    PublicProductVariantQuery,
    PublicCategoryQuery,
  ],
  // `APP11-B03`. Exported so the public Gallery detail can ask *this* module
  // whether a linked Product may be shown, rather than re-deriving publication
  // visibility over the catalog tables it must not read
  // (`BACKEND_CONVENTIONS.md` §10). Only the read port leaves: the queries and
  // the controllers stay private to this graph.
  exports: [PUBLIC_PRODUCT_REPOSITORY],
})
export class CatalogPublicModule {}
