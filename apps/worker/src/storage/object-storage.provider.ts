/**
 * The worker's binding to `@embroidery/object-storage` (APP2-I03).
 *
 * The worker is deployed and scaled independently of the API, so it constructs
 * its own client — exactly as it already owns its own database pool
 * (DEC-DB7-003). Nothing is copied from the API: configuration parsing, client
 * construction and the bucket algorithm all come from the package's own
 * factories, and only the composition differs.
 *
 * Configuration is read **once, at provider construction**, so a misconfigured
 * worker fails while it is starting rather than on the first derivative write.
 * Constructing the S3 client opens no socket, which is what lets the runtime
 * test harness build this graph against placeholder values without a store.
 *
 * The token lives here rather than in the module so the service can import it
 * without importing the module that provides the service — a cycle Nest
 * resolves as `undefined` at decoration time, which surfaces as an
 * unresolvable dependency at every graph construction.
 */
import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import {
  createS3ObjectStorage,
  describeObjectStorageConfig,
  loadObjectStorageConfig,
  type ObjectStorageConfig,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * The runtime environment the deterministic object keys are namespaced by
 * (APP2-W01).
 *
 * Exposed as its own token, exactly as the API does it, so a job handler can
 * build a key without being handed the whole configuration object — which also
 * carries the credentials.
 */
export const OBJECT_STORAGE_ENVIRONMENT = Symbol('OBJECT_STORAGE_ENVIRONMENT');

const OBJECT_STORAGE_CONFIG = Symbol('OBJECT_STORAGE_CONFIG');

export const objectStorageProviders: Provider[] = [
  {
    provide: OBJECT_STORAGE_CONFIG,
    useFactory: (): ObjectStorageConfig => {
      const config = loadObjectStorageConfig(process.env);
      // The package's own redacted summary — it exists so a startup line can
      // never carry the secret key.
      new Logger('ObjectStorage').log(describeObjectStorageConfig(config));
      return config;
    },
  },
  {
    provide: OBJECT_STORAGE,
    inject: [OBJECT_STORAGE_CONFIG],
    useFactory: (config: ObjectStorageConfig): ObjectStoragePort => createS3ObjectStorage(config),
  },
  {
    provide: OBJECT_STORAGE_ENVIRONMENT,
    inject: [OBJECT_STORAGE_CONFIG],
    useFactory: (config: ObjectStorageConfig): string => config.environment,
  },
];
