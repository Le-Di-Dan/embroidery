/**
 * S3-compatible `ObjectStoragePort` adapter (ADR-APP2-001 §4.1, §4.10).
 *
 * One `S3Client` per adapter, configured from typed config. There is no
 * provider-specific business branch: MinIO and AWS S3 differ only by endpoint
 * and path-style addressing, both of which are configuration. No ACL, no
 * public-read, no vendor administration API.
 *
 * This module never logs. Diagnostics are the consumer's decision, and a log
 * line written here would sit outside the API's redaction pipeline (IMP-D022).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';

import { ensurePrivateBucketsWith } from './ensure-private-buckets';
import { assertValidObjectKey, assertValidObjectPrefix } from './object-key';
import { assertBoundedMetadata, readMetadata } from './object-metadata';
import { resolveMultipartOptions } from './multipart-options';
import type { ObjectStorageConfig } from './object-storage.config';
import { classifyProviderError, toObjectStorageError } from './object-storage.errors';
import type { ObjectStoragePort } from './object-storage.port';
import type {
  ListObjectsInput,
  ListedObject,
  ObjectMetadata,
  ObjectReference,
  ObjectStorageBucket,
  ObjectStreamResult,
  PutObjectStreamInput,
  StoredObjectResult,
} from './object-storage.types';
import { requestOptions } from './request-options';

/** Guards against a provider paging forever on a malformed continuation token. */
const MAX_LIST_PAGES = 1_000;

export function createS3Client(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    // Both spread conditionally: passing `undefined` is not the same as
    // omitting them — it suppresses the SDK's own default resolution.
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(config.credentials === undefined ? {} : { credentials: config.credentials }),
    forcePathStyle: config.forcePathStyle,
  });
}

function resolveBucketName(config: ObjectStorageConfig, bucket: ObjectStorageBucket): string {
  return bucket === 'ORIGINALS' ? config.originalsBucket : config.derivativesBucket;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

function toSizeBytes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface S3ObjectStorageAdapter extends ObjectStoragePort {
  /** Releases the underlying HTTP handler. Consumers own the lifecycle. */
  close(): void;
}

export function createS3ObjectStorage(
  config: ObjectStorageConfig,
  client: S3Client = createS3Client(config),
): S3ObjectStorageAdapter {
  const bucketNameOf = (bucket: ObjectStorageBucket): string => resolveBucketName(config, bucket);

  async function putObjectStream(input: PutObjectStreamInput): Promise<StoredObjectResult> {
    const key = assertValidObjectKey(input.key);
    const metadata = assertBoundedMetadata(input.metadata);
    const multipart = resolveMultipartOptions(input.multipart);

    const upload = new Upload({
      client,
      params: {
        Bucket: bucketNameOf(input.bucket),
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.contentLengthBytes === undefined
          ? {}
          : { ContentLength: input.contentLengthBytes }),
        ...(metadata === undefined ? {} : { Metadata: metadata }),
      },
      partSize: multipart.partSizeBytes,
      queueSize: multipart.queueSize,
      // Aborted or failed uploads must not leave billable dangling parts that a
      // later lifecycle rule would have to clean up.
      leavePartsOnError: false,
    });

    // Abort by destroying the source stream rather than by calling
    // `upload.abort()`.
    //
    // `Upload.done()` races the real upload against an abort watcher, and
    // `Upload.abort()` only trips that watcher: `done()` then rejects while the
    // upload's own AbortMultipartUpload cleanup is still in flight on a
    // detached promise. The caller would be told the upload failed while parts
    // were still dangling — contract case 16 observed exactly that against a
    // real MinIO.
    //
    // Failing the body instead routes lib-storage through its ordinary error
    // path, where it awaits AbortMultipartUpload before rejecting. So when this
    // method throws, the multipart upload is already cleaned up.
    const onAbort = (): void => {
      const abortError = new Error('Upload aborted.');
      abortError.name = 'AbortError';
      input.body.destroy(abortError);
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const result = await upload.done();
      return {
        bucket: input.bucket,
        key,
        ...(typeof result.ETag === 'string' ? { providerEntityTag: result.ETag } : {}),
      };
    } catch (error: unknown) {
      throw toObjectStorageError(`put object "${key}"`, error);
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function getObjectStream(
    reference: ObjectReference,
    signal?: AbortSignal,
  ): Promise<ObjectStreamResult> {
    const key = assertValidObjectKey(reference.key);
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucketNameOf(reference.bucket), Key: key }),
        requestOptions(signal),
      );
      if (response.Body === undefined) {
        throw toObjectStorageError(`get object "${key}"`, { name: 'InvalidProviderResponse' });
      }
      return {
        bucket: reference.bucket,
        key,
        body: response.Body as Readable,
        sizeBytes: toSizeBytes(response.ContentLength),
        ...(typeof response.ContentType === 'string' ? { contentType: response.ContentType } : {}),
        ...(toDate(response.LastModified) === undefined
          ? {}
          : { lastModified: response.LastModified as Date }),
        ...(typeof response.ETag === 'string' ? { providerEntityTag: response.ETag } : {}),
        metadata: readMetadata(response.Metadata),
      };
    } catch (error: unknown) {
      throw toObjectStorageError(`get object "${key}"`, error);
    }
  }

  async function headObject(
    reference: ObjectReference,
    signal?: AbortSignal,
  ): Promise<ObjectMetadata> {
    const key = assertValidObjectKey(reference.key);
    try {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: bucketNameOf(reference.bucket), Key: key }),
        requestOptions(signal),
      );
      return {
        bucket: reference.bucket,
        key,
        sizeBytes: toSizeBytes(response.ContentLength),
        ...(typeof response.ContentType === 'string' ? { contentType: response.ContentType } : {}),
        ...(toDate(response.LastModified) === undefined
          ? {}
          : { lastModified: response.LastModified as Date }),
        ...(typeof response.ETag === 'string' ? { providerEntityTag: response.ETag } : {}),
        metadata: readMetadata(response.Metadata),
      };
    } catch (error: unknown) {
      throw toObjectStorageError(`head object "${key}"`, error);
    }
  }

  async function deleteObject(reference: ObjectReference, signal?: AbortSignal): Promise<void> {
    const key = assertValidObjectKey(reference.key);
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucketNameOf(reference.bucket), Key: key }),
        requestOptions(signal),
      );
    } catch (error: unknown) {
      // S3 delete is already a no-op for a missing key, but a compatible store
      // may answer 404. Retried cleanup must not fail on its own progress.
      if (classifyProviderError(error) === 'OBJECT_NOT_FOUND') {
        return;
      }
      throw toObjectStorageError(`delete object "${key}"`, error);
    }
  }

  async function listObjectsByPrefix(input: ListObjectsInput): Promise<readonly ListedObject[]> {
    const prefix = assertValidObjectPrefix(input.prefix);
    const bucket = bucketNameOf(input.bucket);
    const found: ListedObject[] = [];
    let continuationToken: string | undefined;
    let page = 0;

    try {
      do {
        page += 1;
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ...(input.pageSizeHint === undefined ? {} : { MaxKeys: input.pageSizeHint }),
            ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
          }),
          requestOptions(input.signal),
        );
        for (const entry of response.Contents ?? []) {
          if (typeof entry.Key === 'string') {
            found.push({
              key: entry.Key,
              sizeBytes: toSizeBytes(entry.Size),
              ...(toDate(entry.LastModified) === undefined
                ? {}
                : { lastModified: entry.LastModified as Date }),
            });
          }
        }
        continuationToken =
          response.IsTruncated === true && typeof response.NextContinuationToken === 'string'
            ? response.NextContinuationToken
            : undefined;
      } while (continuationToken !== undefined && page < MAX_LIST_PAGES);
    } catch (error: unknown) {
      throw toObjectStorageError(`list objects "${prefix}"`, error);
    }
    return found;
  }

  return {
    putObjectStream,
    getObjectStream,
    headObject,
    deleteObject,
    listObjectsByPrefix,
    ensurePrivateBuckets: (signal?: AbortSignal): Promise<void> =>
      ensurePrivateBucketsWith(client, config, signal),
    close: (): void => {
      client.destroy();
    },
  };
}
