import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogPlacementReadModule } from './catalog-placement-read.module';
import { AssetModule } from '../asset/asset.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductPlacementNormalizationRecorder } from './application/product-placement-normalization.recorder';
import { ProductPlacementService } from './application/product-placement.service';
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
 * The repository and the read query live one level down in
 * `CatalogPlacementReadModule`, which carries no controller. That split exists so
 * `APP3-B07` can resolve a Session's scope through the one Catalog query
 * authority without importing this module and, with it, two HTTP surfaces it has
 * no business mounting.
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
 *
 * `DatabaseModule` also supplies the `OutboxEventStore` the normalization
 * recorder appends through (`APP3-B01N`). That recorder is the only thing here
 * that knows an event exists; it takes no queue, no scheduler and no client, so
 * this module gained a provider and not a dependency.
 */
@Module({
  imports: [DatabaseModule, CatalogPlacementReadModule, AssetModule, AuditModule, IdentityModule],
  controllers: [AdminProductPlacementController, PublicProductPlacementController],
  providers: [ProductPlacementNormalizationRecorder, ProductPlacementService],
})
export class CatalogPlacementModule {}
