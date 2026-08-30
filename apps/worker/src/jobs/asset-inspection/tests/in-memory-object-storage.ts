/**
 * An in-memory `ObjectStoragePort` for the Docker-free unit suites.
 *
 * Implements the real seven-method contract rather than a partial mock, so a
 * suite cannot pass because it happened not to call the method that would have
 * failed. Failures are injected per operation, which is how the deterministic
 * versus retryable split gets exercised without an actual outage.
 *
 * Test-only. Build-excluded via `src/**\/tests/**`.
 */
import { Readable } from 'node:stream';
import { ObjectStorageError, type ObjectStorageErrorCode } from '@embroidery/object-storage';
import type {
  CopyObjectInput,
  ListObjectsInput,
  ListedObject,
  ObjectMetadata,
  ObjectReference,
  ObjectStorageBucket,
  ObjectStoragePort,
  ObjectStreamResult,
  PutObjectStreamInput,
  StoredObjectResult,
} from '@embroidery/object-storage';

type Operation = 'get' | 'put' | 'copy' | 'head' | 'delete' | 'list';

interface StoredObject {
  readonly body: Buffer;
  readonly contentType: string;
}

export class InMemoryObjectStorage implements ObjectStoragePort {
  private readonly objects = new Map<string, StoredObject>();
  private readonly failures = new Map<Operation, ObjectStorageErrorCode>();
  /** Set to make a read emit an error mid-stream instead of failing to open. */
  midStreamReadFailure = false;
  readonly calls: { operation: Operation; key: string }[] = [];

  static keyOf(bucket: ObjectStorageBucket, key: string): string {
    return `${bucket}::${key}`;
  }

  put(bucket: ObjectStorageBucket, key: string, body: Buffer, contentType = 'image/png'): void {
    this.objects.set(InMemoryObjectStorage.keyOf(bucket, key), { body, contentType });
  }

  has(bucket: ObjectStorageBucket, key: string): boolean {
    return this.objects.has(InMemoryObjectStorage.keyOf(bucket, key));
  }

  read(bucket: ObjectStorageBucket, key: string): Buffer | undefined {
    return this.objects.get(InMemoryObjectStorage.keyOf(bucket, key))?.body;
  }

  keys(bucket: ObjectStorageBucket): string[] {
    const prefix = `${bucket}::`;
    return [...this.objects.keys()]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length))
      .sort();
  }

  failWith(operation: Operation, code: ObjectStorageErrorCode): void {
    this.failures.set(operation, code);
  }

  clearFailures(): void {
    this.failures.clear();
    this.midStreamReadFailure = false;
  }

  private guard(operation: Operation, key: string): void {
    this.calls.push({ operation, key });
    const code = this.failures.get(operation);
    if (code !== undefined) {
      throw new ObjectStorageError(code, `Object storage ${operation} failed (${code}).`);
    }
  }

  putObjectStream(input: PutObjectStreamInput): Promise<StoredObjectResult> {
    this.guard('put', input.key);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      input.body.on('data', (chunk: Buffer) => chunks.push(chunk));
      input.body.once('error', reject);
      input.body.once('end', () => {
        this.objects.set(InMemoryObjectStorage.keyOf(input.bucket, input.key), {
          body: Buffer.concat(chunks),
          contentType: input.contentType,
        });
        resolve({ bucket: input.bucket, key: input.key });
      });
    });
  }

  copyObject(input: CopyObjectInput): Promise<StoredObjectResult> {
    this.guard('copy', input.destination.key);
    const stored = this.require(input.source);
    // The destination carries its own declared type, matching the adapter's
    // `MetadataDirective: 'REPLACE'` — a fake that inherited the source's would
    // hide exactly the mistake that directive exists to prevent.
    this.objects.set(InMemoryObjectStorage.keyOf(input.destination.bucket, input.destination.key), {
      body: stored.body,
      contentType: input.contentType,
    });
    return Promise.resolve({ bucket: input.destination.bucket, key: input.destination.key });
  }

  getObjectStream(reference: ObjectReference): Promise<ObjectStreamResult> {
    this.guard('get', reference.key);
    const stored = this.require(reference);
    const body = this.midStreamReadFailure
      ? failingStream(stored.body)
      : Readable.from([stored.body]);
    return Promise.resolve({
      bucket: reference.bucket,
      key: reference.key,
      sizeBytes: stored.body.length,
      contentType: stored.contentType,
      metadata: {},
      body,
    });
  }

  headObject(reference: ObjectReference): Promise<ObjectMetadata> {
    this.guard('head', reference.key);
    const stored = this.require(reference);
    return Promise.resolve({
      bucket: reference.bucket,
      key: reference.key,
      sizeBytes: stored.body.length,
      contentType: stored.contentType,
      metadata: {},
    });
  }

  deleteObject(reference: ObjectReference): Promise<void> {
    this.guard('delete', reference.key);
    this.objects.delete(InMemoryObjectStorage.keyOf(reference.bucket, reference.key));
    return Promise.resolve();
  }

  listObjectsByPrefix(input: ListObjectsInput): Promise<readonly ListedObject[]> {
    this.guard('list', input.prefix);
    const listed = this.keys(input.bucket)
      .filter((key) => key.startsWith(input.prefix))
      .map((key) => ({
        key,
        sizeBytes: this.read(input.bucket, key)?.length ?? 0,
      }));
    return Promise.resolve(listed);
  }

  ensurePrivateBuckets(): Promise<void> {
    return Promise.resolve();
  }

  private require(reference: ObjectReference): StoredObject {
    const stored = this.objects.get(InMemoryObjectStorage.keyOf(reference.bucket, reference.key));
    if (stored === undefined) {
      throw new ObjectStorageError(
        'OBJECT_NOT_FOUND',
        'Object storage get failed (OBJECT_NOT_FOUND).',
      );
    }
    return stored;
  }
}

/** Emits the first half of the body and then a transport error. */
function failingStream(body: Buffer): Readable {
  let emitted = false;
  return new Readable({
    read(): void {
      if (emitted) {
        this.destroy(new Error('connection reset'));
        return;
      }
      emitted = true;
      this.push(body.subarray(0, Math.max(1, Math.floor(body.length / 2))));
    },
  });
}
