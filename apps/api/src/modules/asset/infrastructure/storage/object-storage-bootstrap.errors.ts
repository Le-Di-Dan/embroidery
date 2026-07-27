/**
 * Startup classification for a private-bucket bootstrap failure (APP2-I03 §9).
 *
 * Four classes, because an operator's next action differs for each: a bad
 * configuration needs an environment fix, a denied request needs credentials or
 * a bucket owner check, an unavailable provider is usually worth a restart, and
 * an unrecognised response means the endpoint is not the S3-compatible store it
 * was expected to be.
 *
 * The mapping reads `ObjectStorageError.code` — the closed taxonomy APP2-I01
 * already owns — and never string-matches a provider message.
 *
 * The worker carries a deliberately identical mapping of its own
 * (`apps/worker/src/storage/object-storage-bootstrap.errors.ts`). Sharing it
 * would need a new application-layer workspace package, which is outside this
 * checkpoint's boundary; what must not be duplicated — config parsing, client
 * construction, the bucket algorithm and the error taxonomy itself — lives in
 * `@embroidery/object-storage` and is reached from both.
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
      // A bootstrap that reports "not found" or "conflict" after its own
      // head/create sequence is not a normal outcome: the endpoint answered
      // something this code cannot act on. It is never downgraded to
      // "unavailable", which would invite a restart loop against a store that
      // is answering perfectly well with the wrong thing.
      case 'OBJECT_NOT_FOUND':
      case 'CONFLICT':
      case 'INVALID_PROVIDER_RESPONSE':
        return 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE';
    }
  }
  return 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE';
}

/**
 * The startup-safe failure. `message` names the class only; the original error
 * is kept as `cause` for a debugger and must never be serialised into a log.
 */
export class ObjectStorageBootstrapError extends Error {
  readonly errorClass: ObjectStorageBootstrapErrorClass;

  constructor(errorClass: ObjectStorageBootstrapErrorClass, cause?: unknown) {
    super(`Private object-storage bucket bootstrap failed (${errorClass}).`, { cause });
    this.name = 'ObjectStorageBootstrapError';
    this.errorClass = errorClass;
  }
}
