/**
 * Public catalog-media delivery orchestration (`APP2-T01` §16).
 *
 * The two properties worth testing at this level are ordering and translation:
 * no object-storage call may happen before the visibility query succeeds, and
 * no provider detail may survive the trip out. Everything about *which* rows
 * qualify is a database predicate and is proved against real PostgreSQL.
 */
import { Readable } from 'node:stream';
import { ObjectStorageError, type ObjectStreamResult } from '@embroidery/object-storage';

import {
  PublicProductMediaService,
  type PublicProductMediaRequest,
} from './public-product-media.service';
import type {
  PublicProductMediaDescriptor,
  PublicProductMediaLookup,
  PublicProductMediaRepository,
} from '../domain/repositories/public-product-media.repository';
import { isPublicProductMediaError } from '../domain/public-product-media.errors';

const STORAGE_KEY = 'test/derivatives/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/THUMBNAIL.webp';

const REQUEST: PublicProductMediaRequest = {
  slug: 'thu-bong-gau-nau',
  productMediaId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
  rendition: 'thumbnail',
};

class RecordingRepository implements PublicProductMediaRepository {
  readonly lookups: PublicProductMediaLookup[] = [];

  constructor(private readonly descriptor: PublicProductMediaDescriptor | undefined) {}

  findDeliverable(
    lookup: PublicProductMediaLookup,
  ): Promise<PublicProductMediaDescriptor | undefined> {
    this.lookups.push(lookup);
    return Promise.resolve(this.descriptor);
  }
}

interface StorageCall {
  readonly bucket: string;
  readonly key: string;
}

function createStorage(outcome: { result: ObjectStreamResult } | { error: Error }): {
  port: never;
  calls: StorageCall[];
} {
  const calls: StorageCall[] = [];
  const port = {
    getObjectStream: (reference: { bucket: string; key: string }) => {
      calls.push({ bucket: reference.bucket, key: reference.key });
      return 'error' in outcome ? Promise.reject(outcome.error) : Promise.resolve(outcome.result);
    },
  };
  return { port: port as never, calls };
}

function streamResult(overrides: Partial<ObjectStreamResult> = {}): ObjectStreamResult {
  return {
    bucket: 'DERIVATIVES',
    key: STORAGE_KEY,
    sizeBytes: 2048,
    contentType: 'application/octet-stream',
    providerEntityTag: '"d41d8cd98f00b204e9800998ecf8427e"',
    metadata: {},
    body: Readable.from([Buffer.from([1, 2, 3])]),
    ...overrides,
  };
}

function createService(
  repository: PublicProductMediaRepository,
  storage: { port: never },
): PublicProductMediaService {
  return new PublicProductMediaService(repository, storage.port);
}

describe('PublicProductMediaService', () => {
  it('translates the rendition into the derivative kind and required role', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult() });

    await createService(repository, storage).open(REQUEST, new AbortController().signal);

    expect(repository.lookups).toStrictEqual([
      {
        slug: REQUEST.slug,
        productMediaId: REQUEST.productMediaId,
        derivativeKind: 'THUMBNAIL',
        requiredRole: 'THUMBNAIL',
      },
    ]);
  });

  it('asks for the gallery derivative with no role restriction', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult() });

    await createService(repository, storage).open(
      { ...REQUEST, rendition: 'catalog-preview' },
      new AbortController().signal,
    );

    expect(repository.lookups[0]?.derivativeKind).toBe('CATALOG_PREVIEW');
    expect(repository.lookups[0]?.requiredRole).toBeUndefined();
  });

  it('makes no object-storage call when the media is not publicly visible', async () => {
    const repository = new RecordingRepository(undefined);
    const storage = createStorage({ result: streamResult() });

    await expect(
      createService(repository, storage).open(REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PUBLIC_PRODUCT_MEDIA_NOT_FOUND' });

    // The ordering guarantee: an anonymous prober never reaches the provider.
    expect(storage.calls).toStrictEqual([]);
  });

  it('opens exactly one object, from the derivatives bucket, at the stored key', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult() });

    await createService(repository, storage).open(REQUEST, new AbortController().signal);

    expect(storage.calls).toStrictEqual([{ bucket: 'DERIVATIVES', key: STORAGE_KEY }]);
  });

  it('serves the derivative content type, not the provider echo', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    // The provider reports a useless generic type; the policy must win.
    const storage = createStorage({ result: streamResult({ contentType: 'application/xml' }) });

    const stream = await createService(repository, storage).open(
      REQUEST,
      new AbortController().signal,
    );

    expect(stream.contentType).toBe('image/webp');
  });

  it('returns no storage key, bucket, checksum or provider tag', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult() });

    const stream = await createService(repository, storage).open(
      REQUEST,
      new AbortController().signal,
    );

    expect(Object.keys(stream).sort()).toStrictEqual(['body', 'contentLengthBytes', 'contentType']);
    const serialised = JSON.stringify({ ...stream, body: undefined });
    for (const forbidden of ['derivatives/', STORAGE_KEY, 'd41d8cd9', 'DERIVATIVES']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('reports the provider length for the exact object being streamed', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult({ sizeBytes: 4096 }) });

    const stream = await createService(repository, storage).open(
      REQUEST,
      new AbortController().signal,
    );

    expect(stream.contentLengthBytes).toBe(4096);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['not finite', Number.NaN],
  ])('omits the length when the provider reports a %s size', async (_label, sizeBytes) => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({ result: streamResult({ sizeBytes }) });

    const stream = await createService(repository, storage).open(
      REQUEST,
      new AbortController().signal,
    );

    // A wrong Content-Length truncates or hangs the response; absent is safe.
    expect(stream.contentLengthBytes).toBeUndefined();
  });

  it('reports a provider failure as unavailable, never as not-found', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({
      error: new ObjectStorageError('PROVIDER_UNAVAILABLE', 'Object storage get failed.'),
    });

    await expect(
      createService(repository, storage).open(REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PUBLIC_PRODUCT_MEDIA_UNAVAILABLE' });
  });

  it('reports an object that vanished after a valid descriptor as unavailable', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({
      error: new ObjectStorageError('OBJECT_NOT_FOUND', 'Object storage get failed.'),
    });

    // The product *is* public and the row says READY: a missing object is a
    // storage contradiction, and 404 would tell an honest caller to give up.
    await expect(
      createService(repository, storage).open(REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PUBLIC_PRODUCT_MEDIA_UNAVAILABLE' });
  });

  it('leaks no provider message, key or endpoint through the safe error', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({
      error: new ObjectStorageError(
        'PROVIDER_UNAVAILABLE',
        `connect ECONNREFUSED 127.0.0.1:9000 for ${STORAGE_KEY}`,
      ),
    });

    const error = await createService(repository, storage)
      .open(REQUEST, new AbortController().signal)
      .catch((thrown: unknown) => thrown);

    expect(isPublicProductMediaError(error)).toBe(true);
    const message = (error as Error).message;
    for (const forbidden of ['9000', '127.0.0.1', STORAGE_KEY, 'ECONNREFUSED', 'DERIVATIVES']) {
      expect(message).not.toContain(forbidden);
    }
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });

  it('propagates a client abort as the abort it is', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const storage = createStorage({
      error: new ObjectStorageError('REQUEST_ABORTED', 'Object storage get failed.'),
    });

    // Nobody is left to receive a response, so this must not be dressed up as
    // a server fault the operator would investigate.
    await expect(
      createService(repository, storage).open(REQUEST, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });

  it('never buffers the object into memory', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    const body = Readable.from([Buffer.from([1, 2, 3])]);
    const storage = createStorage({ result: streamResult({ body }) });

    const stream = await createService(repository, storage).open(
      REQUEST,
      new AbortController().signal,
    );

    // The very stream the provider opened is handed on, unread.
    expect(stream.body).toBe(body);
    expect(body.readableEnded).toBe(false);
    expect(Buffer.isBuffer(stream.body as unknown)).toBe(false);
  });

  it('passes the caller signal through to the provider', async () => {
    const repository = new RecordingRepository({ storageKey: STORAGE_KEY });
    let received: AbortSignal | undefined;
    const port = {
      getObjectStream: (_reference: unknown, signal?: AbortSignal) => {
        received = signal;
        return Promise.resolve(streamResult());
      },
    };
    const controller = new AbortController();

    await new PublicProductMediaService(repository, port as never).open(REQUEST, controller.signal);

    expect(received).toBe(controller.signal);
  });
});
