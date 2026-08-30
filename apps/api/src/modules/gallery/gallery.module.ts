import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { GALLERY_ENTRY_PUBLICATION_REPOSITORY } from './domain/repositories/gallery-entry-publication.repository';
import { GALLERY_ENTRY_REPOSITORY } from './domain/repositories/gallery-entry.repository';
import { DrizzleGalleryEntryPublicationRepository } from './infrastructure/persistence/drizzle-gallery-entry-publication.repository';
import { DrizzleGalleryEntryRepository } from './infrastructure/persistence/drizzle-gallery-entry.repository';

/**
 * CTX-GAL — published showcase persistence (DB7-CP3).
 *
 * Two ports over one aggregate (`APP11-B02`): the authoring contract, and the
 * narrow locking/guarded-write contract the media and publication commands
 * need. Both are provided here so there is exactly one Gallery persistence
 * implementation of each in the process, and both are exported so a feature
 * module composes them rather than re-providing one.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: GALLERY_ENTRY_REPOSITORY, useClass: DrizzleGalleryEntryRepository },
    {
      provide: GALLERY_ENTRY_PUBLICATION_REPOSITORY,
      useClass: DrizzleGalleryEntryPublicationRepository,
    },
  ],
  exports: [GALLERY_ENTRY_REPOSITORY, GALLERY_ENTRY_PUBLICATION_REPOSITORY],
})
export class GalleryModule {}
