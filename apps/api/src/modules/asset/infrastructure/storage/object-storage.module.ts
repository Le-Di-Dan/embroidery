import { Module } from '@nestjs/common';

import { objectStorageProviders } from './object-storage.provider';
import { OBJECT_STORAGE, OBJECT_STORAGE_ENVIRONMENT } from './object-storage.provider';

/**
 * The shared binding of `@embroidery/object-storage` into the Nest graph
 * (`APP2-T01`).
 *
 * Extracted from `AssetIntakeModule` when a second feature — public catalog
 * media delivery — needed the same port. Spreading `objectStorageProviders`
 * into both modules would have built **two** S3 clients from the same
 * configuration and logged the startup summary twice; a module both can import
 * keeps exactly one.
 *
 * It provides the port and its environment namespace and nothing else: no
 * controller, no lifecycle, no bucket bootstrap. Bootstrap stays with the asset
 * feature that owns it (`APP2-I03`).
 */
@Module({
  providers: [...objectStorageProviders],
  exports: [OBJECT_STORAGE, OBJECT_STORAGE_ENVIRONMENT],
})
export class ObjectStorageModule {}
