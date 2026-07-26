/**
 * Data shapes crossing the `ObjectStoragePort` boundary (ADR-APP2-001 §4.10).
 *
 * Framework-neutral and provider-neutral: nothing here imports the AWS SDK, so
 * a consumer can depend on the port without pulling a vendor type into its own
 * signatures. No type in this file carries a public URL — APP2 delivers objects
 * only through publication-gated application routes (ADR §4.7).
 */
import type { Readable } from 'node:stream';

/**
 * Business code addresses buckets by role, never by name. The concrete names
 * come from configuration, so an environment rename cannot reach a call site
 * and an arbitrary caller-chosen bucket is not expressible.
 */
export const OBJECT_STORAGE_BUCKETS = ['ORIGINALS', 'DERIVATIVES'] as const;

export type ObjectStorageBucket = (typeof OBJECT_STORAGE_BUCKETS)[number];

/**
 * `lib-storage` managed-multipart bounds. Optional so callers inherit the
 * reviewed defaults; typed so a future tuning decision is validated rather than
 * threaded through as loose numbers.
 */
export interface MultipartUploadOptions {
  /** Bytes per part. Provider minimum is 5 MiB for all but the final part. */
  readonly partSizeBytes?: number;
  /** Parts buffered concurrently. In-flight memory scales with this. */
  readonly queueSize?: number;
}

export interface PutObjectStreamInput {
  readonly bucket: ObjectStorageBucket;
  /** Must come from the `object-key` builders; free-form keys are rejected. */
  readonly key: string;
  readonly body: Readable;
  readonly contentType: string;
  /** Omit for an unknown-length stream — managed multipart handles it. */
  readonly contentLengthBytes?: number;
  /** Bounded, non-secret provider metadata. Never PII (ADR §4.4). */
  readonly metadata?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly multipart?: MultipartUploadOptions;
}

/**
 * `providerEntityTag` is the raw provider ETag. It is **opaque**: a multipart
 * ETag is not an MD5 and never any content hash. The authoritative checksum is
 * the server-computed SHA-256 persisted by the caller (ADR §4.6).
 */
export interface StoredObjectResult {
  readonly bucket: ObjectStorageBucket;
  readonly key: string;
  readonly providerEntityTag?: string;
}

export interface ObjectMetadata {
  readonly bucket: ObjectStorageBucket;
  readonly key: string;
  readonly sizeBytes: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly providerEntityTag?: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ObjectStreamResult extends ObjectMetadata {
  readonly body: Readable;
}

export interface ObjectReference {
  readonly bucket: ObjectStorageBucket;
  readonly key: string;
}

export interface ListObjectsInput {
  readonly bucket: ObjectStorageBucket;
  /** A validated APP2-owned prefix. There is no unrestricted list-all call. */
  readonly prefix: string;
  /** Provider page size; the port paginates transparently when omitted. */
  readonly pageSizeHint?: number;
  readonly signal?: AbortSignal;
}

export interface ListedObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly lastModified?: Date;
}
