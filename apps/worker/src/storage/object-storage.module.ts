/**
 * The worker's object-storage composition (APP2-I03).
 *
 * Global so the generic job runtime can inject `WORKER_STARTUP_GATE` without
 * importing anything that knows what object storage is. The binding itself
 * lives here, in the composition layer, where the choice belongs.
 */
import { Global, Module } from '@nestjs/common';

import { WORKER_STARTUP_GATE } from '../runtime/startup/startup-gate';
import { ObjectStorageBootstrapService } from './object-storage-bootstrap.service';
import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
  objectStorageProviders,
} from './object-storage.provider';

@Global()
@Module({
  providers: [
    ...objectStorageProviders,
    ObjectStorageBootstrapService,
    { provide: WORKER_STARTUP_GATE, useExisting: ObjectStorageBootstrapService },
  ],
  // The port and its environment namespace are exported for job modules
  // (APP2-W01). The configuration object itself is not: it carries the
  // credentials, and no handler has a reason to hold them.
  exports: [
    ObjectStorageBootstrapService,
    WORKER_STARTUP_GATE,
    OBJECT_STORAGE,
    OBJECT_STORAGE_ENVIRONMENT,
  ],
})
export class WorkerObjectStorageModule {}
