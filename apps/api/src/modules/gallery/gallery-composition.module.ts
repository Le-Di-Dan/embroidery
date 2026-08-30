import { Module } from '@nestjs/common';

import { GalleryAdminMediaModule } from './gallery-admin-media.module';
import { GalleryAdminModule } from './gallery-admin.module';
import { GalleryPublicMediaModule } from './gallery-public-media.module';
import { GalleryPublicModule } from './gallery-public.module';

/**
 * The CTX-GAL HTTP surface, composed in one place (`APP11-B03-C1`).
 *
 * Four modules, every one of them under `modules/gallery`, and the reason
 * there are four rather than one is written against each below: each is the
 * whole security boundary of one Gallery lane, and a reviewer must be able to
 * read one without the other. That argument is about *these* modules, so it
 * belongs beside them — not in the application root, where `APP11-B03` had
 * begun to grow it, and where `PaymentCompositionModule` already set the
 * precedent for moving such a block out.
 *
 * This module is composition and nothing else: it declares no controller, no
 * provider and no export, so it grants no capability any member did not
 * already have and resolves nothing on its own. Every member keeps its own
 * injector and its own published domain, so the "defined by what it cannot
 * inject" property each one is accepted on is exactly as it was — in
 * particular, importing this module does **not** make the Admin authoring
 * providers, the guarded publication writer or the object-storage port
 * resolvable from a public read.
 *
 * `GalleryModule` is deliberately absent. It is the DB7-CP3 persistence module
 * and stays persistence-focused: the two Admin members import it for the AGG-18
 * ports, the public members hold their own read-only ports, and no controller
 * hangs off it.
 *
 * Registration order inside the array is preserved verbatim from the root, and
 * `AppModule` imports this module at the position the block occupied. The route
 * surface is therefore byte-identical — proved by the committed OpenAPI
 * artifact still matching after the extraction.
 */
@Module({
  imports: [
    // `APP11-B01`/`APP11-B02` — the seven Admin gallery operations, and the
    // first routes CTX-GAL ever published: `GalleryModule` had held the AGG-18
    // persistence since DB7-CP3 with no controller above it. The only Gallery
    // member carrying authentication, the Origin allowlist and the guarded
    // publication writer, which is exactly the reach the two public members are
    // defined by not having. Its `admin/gallery-entries` base path is claimed
    // by no other module, so registration order cannot make one route shadow
    // another.
    GalleryAdminModule,
    // `APP11-B03A` — the two Admin gallery-media operations, on their own
    // `admin/gallery-assets` base path, claimed by no other module. A fourth
    // member because it is the only Gallery surface holding the Asset write
    // port and a configured object store, and `GalleryAdminModule` above was
    // accepted on holding neither. It composes no AGG-18 port at all, so
    // preparing an image cannot attach it or publish anything.
    GalleryAdminMediaModule,
    // `APP11-B03` — the two anonymous JSON reads, on their own
    // `public/gallery-entries` base path. Defined by what it cannot inject: no
    // object-storage module, so no read can open a private object; no Admin
    // provider and neither AGG-18 write port, so no route here can lock a row,
    // change a status or edit a curated selection. It imports
    // `CatalogPublicModule` for the public product read port only, so a linked
    // Product's visibility is answered by the module that owns that predicate
    // rather than re-derived over catalog tables.
    GalleryPublicModule,
    // `APP11-B03` — the one anonymous binary route, on the same base path with
    // a four-segment sub-path (`{slug}/assets/{assetId}/{rendition}`) disjoint
    // from the two reads above, so registration order cannot make one shadow
    // another. A second public module because it is the only Gallery surface
    // that needs a configured object store, and putting one in
    // `GalleryPublicModule` would make `getObjectStream` resolvable from a JSON
    // read that must never open an object. `CONTROLLER_DOMAIN_KEYS` keeps both
    // publishing the one `publicGalleryEntry` domain.
    GalleryPublicMediaModule,
  ],
})
export class GalleryCompositionModule {}
