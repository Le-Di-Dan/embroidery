import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogPublicModule } from '../catalog/catalog-public.module';
import { PUBLIC_GALLERY_ENTRY_REPOSITORY } from './domain/repositories/public-gallery-entry.repository';
import { DrizzlePublicGalleryEntryRepository } from './infrastructure/persistence/drizzle-public-gallery-entry.repository';
import { PublicGalleryEntryQuery } from './application/public-gallery-entry.query';
import { PublicGalleryEntryController } from './presentation/public-gallery-entry.controller';

/**
 * `APP11-B03` — the two public gallery reads.
 *
 * Its own module, alongside `GalleryPublicMediaModule` rather than inside it:
 * the two share a base path but not a concern, and separating them means the
 * JSON queries stand up a database and nothing else. In particular this graph
 * has **no object-storage provider** — neither operation touches bytes, and not
 * wiring the port is a stronger guarantee of that than a test asserting they do
 * not.
 *
 * Deliberately absent: every Admin provider, and both `GalleryModule` ports.
 * `GalleryAdminModule` carries authentication, the Origin allowlist and the
 * guarded-write publication repository that takes `FOR UPDATE` locks; an
 * anonymous read has no business sharing a graph with any of it, and holding a
 * narrow read port of its own is what makes "a public GET cannot lock a row or
 * mutate an entry" a composition fact rather than a convention.
 *
 * `CatalogPublicModule` is imported for `PUBLIC_PRODUCT_REPOSITORY` only — the
 * existing public Catalog read authority that decides whether a linked Product
 * may be shown. Gallery therefore never reads a catalog table and never becomes
 * a second definition of product publication visibility
 * (`BACKEND_CONVENTIONS.md` §10).
 */
@Module({
  imports: [DatabaseModule, CatalogPublicModule],
  controllers: [PublicGalleryEntryController],
  providers: [
    { provide: PUBLIC_GALLERY_ENTRY_REPOSITORY, useClass: DrizzlePublicGalleryEntryRepository },
    PublicGalleryEntryQuery,
  ],
  // `APP11-B04`. Exported so the SEO inventory can ask *this* module whether a
  // gallery detail would currently render, rather than re-deriving publication
  // and media eligibility over the tables it must not read
  // (`BACKEND_CONVENTIONS.md` §10). Only the read port leaves: the query and
  // the controller stay private to this graph, and the port itself takes no
  // lock and offers no write, so exporting it grants no capability an anonymous
  // read does not already have.
  exports: [PUBLIC_GALLERY_ENTRY_REPOSITORY],
})
export class GalleryPublicModule {}
