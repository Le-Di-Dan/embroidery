import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { GALLERY_ENTRY_REPOSITORY } from './domain/repositories/gallery-entry.repository';
import { DrizzleGalleryEntryRepository } from './infrastructure/persistence/drizzle-gallery-entry.repository';

/** CTX-GAL — published showcase persistence (DB7-CP3). */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: GALLERY_ENTRY_REPOSITORY, useClass: DrizzleGalleryEntryRepository }],
  exports: [GALLERY_ENTRY_REPOSITORY],
})
export class GalleryModule {}
