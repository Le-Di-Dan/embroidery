/**
 * The object-storage contract consumed by `apps/api` and `apps/worker`
 * (ADR-APP2-001 §4.10).
 *
 * Exactly seven operations — six from `APP2-I01`, plus the server-side copy
 * `APP11-B03A` needed to derive a public showcase asset from an already
 * inspected private one. The surface is closed on purpose:
 *
 * - there is **no** presign operation — APP2 has no browser-credential or
 *   stable-public-URL flow (ADR §4.7/§4.8), so exposing one would create a
 *   delivery path that bypasses the publication check;
 * - there is **no** unrestricted list-all — every listing is prefix-scoped;
 * - buckets are addressed by alias, so no call site can name a bucket.
 *
 * Every method rejects with `ObjectStorageError`; nothing here throws a raw
 * SDK exception, and this package never logs.
 */
import type {
  CopyObjectInput,
  ListObjectsInput,
  ListedObject,
  ObjectMetadata,
  ObjectReference,
  ObjectStreamResult,
  PutObjectStreamInput,
  StoredObjectResult,
} from './object-storage.types';

export interface ObjectStoragePort {
  /**
   * Streams a body to storage using managed multipart. The stream is never
   * buffered whole; on abort or stream error the multipart upload is aborted so
   * no completed object and no dangling parts remain.
   */
  putObjectStream(input: PutObjectStreamInput): Promise<StoredObjectResult>;

  /** Opens a read stream. The caller owns consuming or destroying the body. */
  getObjectStream(reference: ObjectReference, signal?: AbortSignal): Promise<ObjectStreamResult>;

  /**
   * Copies one object to another key, provider-side (`APP11-B03A`).
   *
   * Not a convenience over get-then-put: the bytes never enter this process, so
   * the destination is byte-identical by construction and the operation costs
   * no heap. A missing source is `OBJECT_NOT_FOUND`, so a caller cannot use a
   * successful copy to conclude anything it did not already know.
   *
   * The destination is overwritten if it exists, exactly as `putObjectStream`
   * would — the caller owns key uniqueness, and every key this repository mints
   * is derived from a freshly allocated UUIDv7.
   */
  copyObject(input: CopyObjectInput): Promise<StoredObjectResult>;

  /** Metadata without the body. Throws `OBJECT_NOT_FOUND` when absent. */
  headObject(reference: ObjectReference, signal?: AbortSignal): Promise<ObjectMetadata>;

  /**
   * Removes an object. Idempotent: deleting a key that does not exist is a
   * success, so a retried cleanup never fails on its own earlier progress.
   */
  deleteObject(reference: ObjectReference, signal?: AbortSignal): Promise<void>;

  /** Paginates a validated APP2-owned prefix to completion. */
  listObjectsByPrefix(input: ListObjectsInput): Promise<readonly ListedObject[]>;

  /**
   * Creates the configured originals and derivatives buckets if missing.
   * Idempotent, private-only: no public-read and no anonymous-list policy is
   * ever applied.
   */
  ensurePrivateBuckets(signal?: AbortSignal): Promise<void>;
}
