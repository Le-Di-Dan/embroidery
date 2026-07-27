/**
 * The API's binding to `@embroidery/object-storage` (`ADR-APP2-001` §4.10).
 *
 * The package is side-effect-free on import and constructs nothing by itself,
 * so composition happens here. Configuration is read **once, at provider
 * construction**, matching how `DatabaseModule` treats `DATABASE_URL`: a
 * misconfigured process fails during bootstrap rather than on the first upload,
 * when a customer is already waiting.
 *
 * Constructing the S3 client opens no socket, so this stays compatible with the
 * two application graphs that build `AppModule` without a running MinIO — the
 * OpenAPI generator and the integration harness — both of which supply
 * non-connecting placeholder values the same way they already do for the
 * database URL.
 */
import { Logger, type Provider } from '@nestjs/common';
import {
  createS3ObjectStorage,
  describeObjectStorageConfig,
  loadObjectStorageConfig,
  type ObjectStorageConfig,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** The runtime environment the deterministic object key is namespaced by. */
export const OBJECT_STORAGE_ENVIRONMENT = Symbol('OBJECT_STORAGE_ENVIRONMENT');

const OBJECT_STORAGE_CONFIG = Symbol('OBJECT_STORAGE_CONFIG');

export const objectStorageProviders: Provider[] = [
  {
    provide: OBJECT_STORAGE_CONFIG,
    useFactory: (): ObjectStorageConfig => {
      const config = loadObjectStorageConfig(process.env);
      // `describeObjectStorageConfig` is the package's redacted summary — it
      // exists precisely so a startup line can never carry the secret key.
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
