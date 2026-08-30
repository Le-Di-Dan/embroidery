import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { GalleryModule } from './gallery.module';
import { AdminGalleryEntryLifecycleService } from './application/admin-gallery-entry-lifecycle.service';
import { AdminGalleryEntryQuery } from './application/admin-gallery-entry.query';
import { AdminGalleryEntryService } from './application/admin-gallery-entry.service';
import { LinkedProductResolver } from './application/linked-product.resolver';
import { AdminGalleryEntryLifecycleController } from './presentation/admin-gallery-entry-lifecycle.controller';
import { AdminGalleryEntryController } from './presentation/admin-gallery-entry.controller';

/**
 * The Admin gallery authoring feature (`APP11-B01`).
 *
 * Kept separate from `GalleryModule` for the reason `CatalogDraftModule` states
 * about `CatalogModule`: that one is the DB7 persistence module, and a suite
 * that only exercises the AGG-18 repository should not have to stand up
 * authentication and a controller to do it. This module imports it for the
 * repository rather than re-providing one, so there is exactly one Gallery
 * persistence implementation in the process.
 *
 * `CatalogModule` is imported for `CATALOG_SUBJECT_PORT` only — the existing
 * internal Catalog read authority that proves a `linked_product_id` names a
 * real product. Gallery therefore never reads a catalog table and never calls
 * our own HTTP API to answer the question (`BACKEND_CONVENTIONS.md` §10).
 *
 * What this module deliberately does not compose: no Asset write port, no
 * outbox, no object storage and no worker. `APP11-B02` associates media and
 * transitions the lifecycle, and it does both through the Gallery aggregate's
 * own guarded-write port — so no public gallery URL can be minted here, no
 * derivative regenerated, no stored object touched and no event announced.
 */
@Module({
  imports: [DatabaseModule, GalleryModule, CatalogModule, IdentityModule],
  controllers: [AdminGalleryEntryController, AdminGalleryEntryLifecycleController],
  providers: [
    LinkedProductResolver,
    AdminGalleryEntryService,
    AdminGalleryEntryQuery,
    AdminGalleryEntryLifecycleService,
  ],
})
export class GalleryAdminModule {}
