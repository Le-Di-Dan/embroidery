/**
 * Startup classification for a private-bucket bootstrap failure (APP2-I03 §9).
 *
 * Deliberately identical to the API's
 * (`apps/api/src/modules/asset/infrastructure/storage/object-storage-bootstrap.errors.ts`):
 * the two processes must report the same class for the same provider condition,
 * or an operator reading two dashboards sees two different incidents. Sharing
 * one copy would need a new application-layer workspace package, which is
 * outside this checkpoint's boundary; everything that must not be duplicated —
 * config parsing, client construction, the bucket algorithm and the provider
 * error taxonomy itself — lives in `@embroidery/object-storage`.
 */
import { ObjectStorageConfigError, ObjectStorageError } from '@embroidery/object-storage';

export const OBJECT_STORAGE_BOOTSTRAP_ERROR_CLASSES = [
  'OBJECT_STORAGE_CONFIGURATION_INVALID',
  'OBJECT_STORAGE_ACCESS_DENIED',
  'OBJECT_STORAGE_UNAVAILABLE',
  'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE',
] as const;

export type ObjectStorageBootstrapErrorClass =
  (typeof OBJECT_STORAGE_BOOTSTRAP_ERROR_CLASSES)[number];

export function classifyObjectStorageBootstrapFailure(
  error: unknown,
): ObjectStorageBootstrapErrorClass {
  if (error instanceof ObjectStorageBootstrapError) {
    return error.errorClass;
  }
  if (error instanceof ObjectStorageConfigError) {
    return 'OBJECT_STORAGE_CONFIGURATION_INVALID';
  }
  if (error instanceof ObjectStorageError) {
    switch (error.code) {
      case 'ACCESS_DENIED':
        return 'OBJECT_STORAGE_ACCESS_DENIED';
      case 'PROVIDER_UNAVAILABLE':
      case 'PROVIDER_TIMEOUT':
      case 'REQUEST_ABORTED':
        return 'OBJECT_STORAGE_UNAVAILABLE';
      case 'OBJECT_NOT_FOUND':
      case 'CONFLICT':
      case 'INVALID_PROVIDER_RESPONSE':
        return 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE';
    }
  }
  return 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE';
}

export class ObjectStorageBootstrapError extends Error {
  readonly errorClass: ObjectStorageBootstrapErrorClass;

  constructor(errorClass: ObjectStorageBootstrapErrorClass, cause?: unknown) {
    super(`Private object-storage bucket bootstrap failed (${errorClass}).`, { cause });
    this.name = 'ObjectStorageBootstrapError';
    this.errorClass = errorClass;
  }
}
