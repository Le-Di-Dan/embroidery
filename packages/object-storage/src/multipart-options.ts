/**
 * Managed-multipart bounds for `@aws-sdk/lib-storage` `Upload`
 * (ADR-APP2-001 §4.2b, memory-bounds correction).
 *
 * Honest memory statement: provider-managed multipart buffering is
 * approximately bounded by `partSize x queueSize`, excluding runtime overhead
 * (socket buffers, TLS records, V8 and libuv allocations). This package makes
 * no constant-memory claim: the C1 spike measured only Node **heap** delta,
 * which does not account for Buffer/external memory, so it proves only that
 * there is no explicit whole-file application buffer.
 */
import { ObjectStorageConfigError } from './object-storage.errors';
import type { MultipartUploadOptions } from './object-storage.types';

const MIB = 1024 * 1024;

/** Provider floor for every part but the last; a smaller value is rejected outright. */
export const MIN_PART_SIZE_BYTES = 5 * MIB;
/** Provider ceiling for a single part. */
export const MAX_PART_SIZE_BYTES = 5 * 1024 * MIB;
export const MAX_QUEUE_SIZE = 16;

/**
 * Reviewed defaults: 5 MiB x 2 ≈ 10 MiB of in-flight part buffering per upload.
 * Chosen for a single-operator workload, not tuned for throughput. Raising them
 * is a deliberate, validated decision — hence the typed override rather than a
 * loose number at the call site.
 */
export const DEFAULT_PART_SIZE_BYTES = MIN_PART_SIZE_BYTES;
export const DEFAULT_QUEUE_SIZE = 2;

export interface ResolvedMultipartOptions {
  readonly partSizeBytes: number;
  readonly queueSize: number;
  /** Approximate in-flight part buffering, excluding runtime overhead. */
  readonly approximateBufferedBytes: number;
}

function assertBoundedInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    // A tuning value is a configuration decision, not a provider failure, so it
    // must not be classifiable as a retryable provider error.
    throw new ObjectStorageConfigError(
      `Invalid multipart ${name} ${String(value)}: expected an integer between ` +
        `${String(min)} and ${String(max)}.`,
    );
  }
}

export function resolveMultipartOptions(
  options: MultipartUploadOptions | undefined,
): ResolvedMultipartOptions {
  const partSizeBytes = options?.partSizeBytes ?? DEFAULT_PART_SIZE_BYTES;
  const queueSize = options?.queueSize ?? DEFAULT_QUEUE_SIZE;

  assertBoundedInteger('partSizeBytes', partSizeBytes, MIN_PART_SIZE_BYTES, MAX_PART_SIZE_BYTES);
  assertBoundedInteger('queueSize', queueSize, 1, MAX_QUEUE_SIZE);

  return {
    partSizeBytes,
    queueSize,
    approximateBufferedBytes: partSizeBytes * queueSize,
  };
}
