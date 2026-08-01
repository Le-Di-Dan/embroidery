import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PUBLIC_PRODUCT_REPOSITORY } from './domain/repositories/public-product.repository';
import { DrizzlePublicProductRepository } from './infrastructure/persistence/drizzle-public-product.repository';
import { PublicProductQuery } from './application/public-product.query';
import { PublicProductController } from './presentation/public-product.controller';

/**
 * `APP2-B04` — the public catalog queries.
 *
 * Its own module, alongside `CatalogPublicMediaModule` rather than inside it:
 * the two share a base path but not a concern, and separating them means the
 * JSON queries stand up a database and nothing else. In particular this graph
 * has **no object-storage provider** — the list and detail operations never
 * touch bytes, and not wiring the port is a stronger guarantee of that than a
 * test asserting they do not.
 *
 * Deliberately absent: every Admin provider. `CatalogDraftModule` and
 * `CatalogPublicationModule` carry authentication, the Origin allowlist and
 * audit wiring; a public read has no business sharing a graph with them.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicProductController],
  providers: [
    { provide: PUBLIC_PRODUCT_REPOSITORY, useClass: DrizzlePublicProductRepository },
    PublicProductQuery,
  ],
})
export class CatalogPublicModule {}
