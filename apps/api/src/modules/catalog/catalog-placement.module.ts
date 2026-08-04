import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductPlacementQuery } from './application/product-placement.query';
import { ProductPlacementService } from './application/product-placement.service';
import { PRODUCT_PLACEMENT_REPOSITORY } from './domain/repositories/product-placement.repository';
import { DrizzleProductPlacementRepository } from './infrastructure/persistence/drizzle-product-placement.repository';
import { AdminProductPlacementController } from './presentation/admin-product-placement.controller';
import { PublicProductPlacementController } from './presentation/public-product-placement.controller';

/**
 * Product placement authoring and the public manifest (`APP3-B01`).
 *
 * Placement belongs to **Product/Catalog**, never to Design (IMP-D041 PO-01):
 * Design Templates and Design Sessions may reference a Side or an Area but may
 * never create or mutate one, so no Design module imports this and this imports
 * no Design module. That also keeps the dependency graph acyclic by
 * construction rather than by care.
 *
 * Kept separate from `CatalogDraftModule` and `CatalogPublicationModule` for the
 * reason they are separate from each other: placement has its own repository,
 * its own two controllers and its own dependency set.
 *
 * `AssetModule` is imported for its **public** repository port — the background
 * association is validated through that boundary rather than by reading the
 * asset tables, so the association stays Catalog's and the asset metadata stays
 * Asset's (ADR-DB4-003). The public manifest's eligibility predicate is the one
 * exception and it is SQL, not a repository call: it must be a correlated
 * `EXISTS` inside the side query or a Product with six sides becomes seven round
 * trips, and it selects a boolean rather than any asset fact.
 *
 * Both controllers are registered here, Admin and public alike, because they are
 * two views of one contract: adding a field to the authoring model and
 * forgetting the manifest, or the reverse, should be one file's problem.
 */
@Module({
  imports: [DatabaseModule, AssetModule, AuditModule, IdentityModule],
  controllers: [AdminProductPlacementController, PublicProductPlacementController],
  providers: [
    { provide: PRODUCT_PLACEMENT_REPOSITORY, useClass: DrizzleProductPlacementRepository },
    ProductPlacementQuery,
    ProductPlacementService,
  ],
})
export class CatalogPlacementModule {}
