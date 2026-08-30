import { Module } from '@nestjs/common';

import { CatalogPublicModule } from '../catalog/catalog-public.module';
import { GalleryPublicModule } from '../gallery/gallery-public.module';
import { PublicSitemapQuery } from './application/public-sitemap.query';
import { PublicSitemapEntryController } from './presentation/public-sitemap-entry.controller';

/**
 * `APP11-B04` — the one public SEO inventory operation.
 *
 * ## Why it lives under CTX-CNT
 *
 * The inventory spans Catalog and Gallery, so it belongs to neither. CTX-CNT is
 * the context that already owns SEO — `ContentModule`'s own docblock names it
 * "SEO pages, redirects and agreements" — and an inventory of indexable URLs is
 * an SEO concern that happens to read two other contexts, not a catalog or a
 * gallery feature. Hanging it off either would have made one of them the owner
 * of the other's indexability.
 *
 * ## Defined by what it cannot inject
 *
 * No object-storage module, so no route here can open an object. No Admin
 * provider, no write repository, no transaction manager and no publication
 * port, so this graph cannot lock a row, change a status or mutate anything —
 * a composition fact rather than a convention a test has to assert. It holds
 * the two `CONTENT_PAGE_REPOSITORY` / `REDIRECT_RULE_REPOSITORY` ports of its
 * own parent no more than it holds an Admin one: `APP11-G01` rejected a
 * content-page API for this phase, and not wiring those ports is what makes
 * "no content-page row is emitted" impossible to violate.
 *
 * `CatalogPublicModule` and `GalleryPublicModule` are imported for their public
 * read ports **only** — the two modules that already own "is this Product
 * publicly visible" and "would this gallery detail render". This module
 * therefore reads no catalog and no gallery table, and never becomes a second
 * definition of either predicate (`BACKEND_CONVENTIONS.md` §10). Nest resolves
 * both to the same module instances the delivered public routes use, so the
 * sitemap cannot drift from the pages it advertises.
 *
 * Registered beneath `ContentModule` rather than in the application root: the
 * root composes contexts, and CTX-CNT publishing its first HTTP surface is a
 * fact about this context, so it is recorded here — the same argument
 * `GalleryCompositionModule` and `PaymentCompositionModule` were accepted on.
 */
@Module({
  imports: [CatalogPublicModule, GalleryPublicModule],
  controllers: [PublicSitemapEntryController],
  providers: [PublicSitemapQuery],
})
export class ContentPublicSeoModule {}
