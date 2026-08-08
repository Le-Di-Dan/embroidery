import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { PUBLISHED_DESIGN_TEMPLATE_REPOSITORY } from './domain/repositories/published-design-template.repository';
import { DrizzlePublishedDesignTemplateRepository } from './infrastructure/persistence/drizzle-published-design-template.repository';
import { PublicDesignTemplateQuery } from './application/public-design-template.query';
import { PublicDesignTemplateController } from './presentation/public-design-template.controller';

/**
 * The public Design Template surface (`APP3-B05`).
 *
 * A third Design module, and the smallest of the three. `DesignTemplateAdminModule`
 * is the authenticated Admin surface and carries `IdentityModule` and
 * `AuditModule`; `DesignModule` is the anonymous Session stack and carries a
 * cookie policy, a rate limiter, a secret pepper and object storage. These two
 * operations need none of that, and composing them into either module would give
 * an anonymous, unauthenticated read a dependency closure it has no use for —
 * in the Admin case, a staff-auth dependency inside a public route's module.
 *
 * The dependency set is deliberately two imports:
 *
 * - `DatabaseModule` for the executor the read adapter needs.
 * - `CatalogPlacementReadModule` for the placement **port** — the same
 *   controller-free read boundary `APP3-B07`, `APP3-B08` and the Admin scope
 *   authority already use. Design asks Catalog whether a scope is publicly
 *   designable; it never re-derives the answer and never touches a Catalog table.
 *
 * ## The read-only guarantee is structural
 *
 * This module binds `PUBLISHED_DESIGN_TEMPLATE_REPOSITORY` and **not**
 * `DESIGN_TEMPLATE_REPOSITORY`. Every method behind that token is a read, so
 * there is no `publishVersion`, no `archive`, no `saveDraftVersion` and no
 * `attachAsset` reachable from this surface at all. `APP3-B05` writes nothing,
 * appends no audit row and enqueues no work — and the way that is guaranteed is
 * that nothing here can. There is likewise no `AuditModule` and no outbox
 * dependency to append with, and no `AssetModule` or `ObjectStorageModule` to
 * reach bytes with: published Template asset delivery is `APP3-B05A`'s, under
 * its own authorization proof.
 */
@Module({
  imports: [DatabaseModule, CatalogPlacementReadModule],
  controllers: [PublicDesignTemplateController],
  providers: [
    {
      provide: PUBLISHED_DESIGN_TEMPLATE_REPOSITORY,
      useClass: DrizzlePublishedDesignTemplateRepository,
    },
    PublicDesignTemplateQuery,
  ],
})
export class DesignTemplatePublicModule {}
