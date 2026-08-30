/**
 * `@embroidery/object-storage` — the S3-compatible storage foundation
 * (APP2-I01, ADR-APP2-001 / IMP-D028).
 *
 * Framework-neutral and side-effect-free on import: it constructs no client,
 * reads no environment variable and starts nothing at module load. Composition
 * happens where the consumer decides.
 *
 * Owns the port, the S3 adapter, configuration parsing, bucket bootstrap, key
 * helpers and error mapping. Owns no asset lifecycle, idempotency, HTTP
 * parsing, worker handler, image processing, repository or UI.
 */
export { createS3Client, createS3ObjectStorage } from './s3-object-storage.adapter';
export type { S3ObjectStorageAdapter } from './s3-object-storage.adapter';

export type { ObjectStoragePort } from './object-storage.port';

export { describeObjectStorageConfig, loadObjectStorageConfig } from './object-storage.config';
export type {
  ObjectStorageConfig,
  ObjectStorageCredentials,
  ObjectStorageEnvironment,
  ObjectStorageProvider,
} from './object-storage.config';

export {
  assertValidObjectKey,
  assertValidObjectPrefix,
  buildAssetPrefix,
  buildDerivativeObjectKey,
  buildOriginalObjectKey,
  OBJECT_SCOPES,
  SUPPORTED_CONTENT_TYPES,
} from './object-key';
export type {
  AssetPrefixInput,
  DerivativeObjectKeyInput,
  ObjectScope,
  OriginalObjectKeyInput,
} from './object-key';

export {
  DEFAULT_PART_SIZE_BYTES,
  DEFAULT_QUEUE_SIZE,
  MAX_PART_SIZE_BYTES,
  MAX_QUEUE_SIZE,
  MIN_PART_SIZE_BYTES,
  resolveMultipartOptions,
} from './multipart-options';
export type { ResolvedMultipartOptions } from './multipart-options';

export {
  MAX_METADATA_ENTRIES,
  MAX_METADATA_KEY_LENGTH,
  MAX_METADATA_VALUE_LENGTH,
} from './object-metadata';

export { ensurePrivateBucketsWith } from './ensure-private-buckets';

export {
  classifyProviderError,
  ObjectKeyError,
  ObjectMetadataError,
  ObjectStorageConfigError,
  ObjectStorageError,
  OBJECT_STORAGE_ERROR_CODES,
  toObjectStorageError,
} from './object-storage.errors';
export type { ObjectStorageErrorCode } from './object-storage.errors';

export { OBJECT_STORAGE_BUCKETS } from './object-storage.types';
export type {
  CopyObjectInput,
  ListObjectsInput,
  ListedObject,
  MultipartUploadOptions,
  ObjectMetadata,
  ObjectReference,
  ObjectStorageBucket,
  ObjectStreamResult,
  PutObjectStreamInput,
  StoredObjectResult,
} from './object-storage.types';
