import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PRODUCT_PLACEMENT_REPOSITORY } from './domain/repositories/product-placement.repository';
import { DrizzleProductPlacementRepository } from './infrastructure/persistence/drizzle-product-placement.repository';
import { ProductPlacementQuery } from './application/product-placement.query';

/**
 * The read side of Product placement, as a provider-only boundary (`APP3-B07`).
 *
 * `CatalogPlacementModule` states an invariant worth keeping: placement belongs
 * to Product/Catalog and no Design module imports it. But a Design Session must
 * open on a *publicly designable* placement, and the single authority for
 * "publicly designable" — public Product, Studio eligibility, the
 * Product → Side → Area chain, stable codes and canvas geometry — is
 * `ProductPlacementQuery`.
 *
 * Design cannot import that module: it carries two controllers and pulls in
 * Identity, Audit and Asset, none of which the read path needs. Duplicating the
 * query in Design would be worse still — a second definition of "publicly
 * designable" that drifts the first time publication rules change.
 *
 * So the read authority moves *down* into a module that has no controller and no
 * write dependency, and both sides consume it: the placement controllers
 * through `CatalogPlacementModule`, and `DesignSessionScopeResolver` through
 * `DesignModule`. Ownership does not move — the query, its repository and its
 * SQL are still Catalog's, and Design still holds no Catalog persistence.
 *
 * The dependency set is deliberately minimal. `DrizzleProductPlacementRepository`
 * needs only a `DatabaseExecutor`; `AssetModule`, `AuditModule` and
 * `IdentityModule` belong to the authoring service and the controllers, and
 * inheriting them here would leak an auth dependency into Design through the
 * back door this module exists to close.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: PRODUCT_PLACEMENT_REPOSITORY, useClass: DrizzleProductPlacementRepository },
    ProductPlacementQuery,
  ],
  exports: [PRODUCT_PLACEMENT_REPOSITORY, ProductPlacementQuery],
})
export class CatalogPlacementReadModule {}
