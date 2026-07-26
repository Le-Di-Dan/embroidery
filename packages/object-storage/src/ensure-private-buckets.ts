/**
 * Idempotent private-bucket bootstrap (ADR-APP2-001 §4.3, §4.12).
 *
 * Deliberately implemented with the same `@aws-sdk/client-s3` already required
 * by the adapter: adding the MinIO client or the `mc` CLI just to create two
 * buckets would introduce a second provider surface for a one-time operation.
 *
 * Security invariant: this function only creates buckets. It never calls
 * `PutBucketPolicy`, `PutBucketAcl`, `PutPublicAccessBlock` or any other policy
 * API. An S3-compatible bucket is private by default; applying a policy here is
 * the only way this code could make one public, so it applies none.
 */
import { CreateBucketCommand, HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';

import type { ObjectStorageConfig } from './object-storage.config';
import { classifyProviderError, toObjectStorageError } from './object-storage.errors';
import { requestOptions } from './request-options';

async function bucketExists(
  client: S3Client,
  bucket: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }), requestOptions(signal));
    return true;
  } catch (error: unknown) {
    const code = classifyProviderError(error);
    if (code === 'OBJECT_NOT_FOUND') {
      return false;
    }
    // ACCESS_DENIED here is not "missing": the bucket may exist and belong to
    // someone else. Reporting it as absent would trigger a create that fails
    // with a confusing conflict instead of the real authorization problem.
    throw toObjectStorageError(`head bucket "${bucket}"`, error);
  }
}

async function createBucket(
  client: S3Client,
  bucket: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }), requestOptions(signal));
  } catch (error: unknown) {
    // Concurrent bootstrap (two replicas starting together) races here. An
    // already-owned bucket is the intended end state, so it is success, not a
    // failure — but a bucket owned by another account still fails loudly.
    const name = (error as { name?: unknown }).name;
    if (name === 'BucketAlreadyOwnedByYou') {
      return;
    }
    throw toObjectStorageError(`create bucket "${bucket}"`, error);
  }
}

export async function ensurePrivateBucketsWith(
  client: S3Client,
  config: ObjectStorageConfig,
  signal?: AbortSignal,
): Promise<void> {
  for (const bucket of [config.originalsBucket, config.derivativesBucket]) {
    if (await bucketExists(client, bucket, signal)) {
      continue;
    }
    await createBucket(client, bucket, signal);
  }
}
