import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PUBLIC_PRODUCT_REPOSITORY } from './domain/repositories/public-product.repository';
import { PUBLIC_PRODUCT_VARIANT_REPOSITORY } from './domain/repositories/public-product-variant.repository';
import { DrizzlePublicProductRepository } from './infrastructure/persistence/drizzle-public-product.repository';
import { DrizzlePublicProductVariantRepository } from './infrastructure/persistence/drizzle-public-product-variant.repository';
import { PublicProductQuery } from './application/public-product.query';
import { PublicProductVariantQuery } from './application/public-product-variant.query';
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
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicProductController, PublicProductVariantController],
  providers: [
    { provide: PUBLIC_PRODUCT_REPOSITORY, useClass: DrizzlePublicProductRepository },
    {
      provide: PUBLIC_PRODUCT_VARIANT_REPOSITORY,
      useClass: DrizzlePublicProductVariantRepository,
    },
    PublicProductQuery,
    PublicProductVariantQuery,
  ],
})
export class CatalogPublicModule {}
