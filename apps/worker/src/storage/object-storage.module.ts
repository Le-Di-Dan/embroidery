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
import { objectStorageProviders } from './object-storage.provider';

@Global()
@Module({
  providers: [
    ...objectStorageProviders,
    ObjectStorageBootstrapService,
    { provide: WORKER_STARTUP_GATE, useExisting: ObjectStorageBootstrapService },
  ],
  exports: [ObjectStorageBootstrapService, WORKER_STARTUP_GATE],
})
export class WorkerObjectStorageModule {}
