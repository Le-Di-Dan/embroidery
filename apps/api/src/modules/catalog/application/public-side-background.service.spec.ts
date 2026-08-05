/**
 * Public Side-background delivery orchestration (`APP3-B02` §4/§5).
 *
 * Two properties dominate this suite, and neither is visible from an integration
 * test that only checks a happy path:
 *
 *  - **ordering**: no object-storage call may happen until the contextual query
 *    has succeeded, so a caller probing slugs cannot use provider load or
 *    response timing as an oracle;
 *  - **reconciliation**: the object about to be streamed must be the object the
 *    row describes. Two authorities now exist — `asset_derivatives.byte_size`
 *    and the provider's own count — and where they disagree the honest answer is
 *    to send neither.
 */
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';
import { Readable } from 'node:stream';

import type {
  PublicSideBackgroundDescriptor,
  PublicSideBackgroundRepository,
} from '../domain/repositories/public-side-background.repository';
import { PublicSideBackgroundService } from './public-side-background.service';

const BYTES = Buffer.from('BACKGROUND-'.repeat(16), 'utf8');

const DESCRIPTOR: PublicSideBackgroundDescriptor = {
  storageKey: 'test/derivatives/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/NORMALIZED.webp',
  mediaType: 'image/webp',
  widthPx: 2048,
  heightPx: 1536,
  byteSize: BYTES.length,
};

const REQUEST = { slug: 'ao-thun-theu-hoa', sideCode: 'front' };

interface Harness {
  readonly service: PublicSideBackgroundService;
  readonly lookups: unknown[];
  readonly opened: string[];
}

function build(options: {
  descriptor?: PublicSideBackgroundDescriptor | undefined;
  providerSize?: number;
  failWith?: Error;
}): Harness {
  const lookups: unknown[] = [];
  const opened: string[] = [];

  const repository: PublicSideBackgroundRepository = {
    findDeliverable: (lookup) => {
      lookups.push(lookup);
      return Promise.resolve(options.descriptor);
    },
  };

  const storage = {
    getObjectStream: (reference: { bucket: string; key: string }) => {
      opened.push(`${reference.bucket}:${reference.key}`);
      // Typed as `Error` so the linter can see what every case actually passes:
      // a provider failure here is always an `ObjectStorageError`.
      if (options.failWith !== undefined) {
        return Promise.reject(options.failWith instanceof Error ? options.failWith : new Error());
      }
      return Promise.resolve({
        body: Readable.from([BYTES]),
        bucket: reference.bucket,
        key: reference.key,
        sizeBytes: options.providerSize ?? BYTES.length,
        metadata: {},
      });
    },
  } as unknown as ObjectStoragePort;

  return {
    service: new PublicSideBackgroundService(repository, storage),
    lookups,
    opened,
  };
}

const signal = (): AbortSignal => new AbortController().signal;

const codeOf = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

describe('eligibility decides before storage is touched', () => {
  it('opens the object only after the descriptor resolved', async () => {
    const harness = build({ descriptor: DESCRIPTOR });
    const stream = await harness.service.open(REQUEST, signal());

    expect(harness.lookups).toEqual([REQUEST]);
    expect(harness.opened).toEqual([`DERIVATIVES:${DESCRIPTOR.storageKey}`]);
    expect(stream.contentType).toBe('image/webp');
  });

  it('never reaches the provider when nothing is deliverable', async () => {
    const harness = build({ descriptor: undefined });

    expect(await codeOf(() => harness.service.open(REQUEST, signal()))).toBe(
      'PUBLIC_SIDE_BACKGROUND_NOT_FOUND',
    );
    // The security property: a probe costs one query and no provider request,
    // so provider load and timing reveal nothing about what exists.
    expect(harness.opened).toEqual([]);
  });

  it('reads the private original bucket for nothing', async () => {
    const harness = build({ descriptor: DESCRIPTOR });
    await harness.service.open(REQUEST, signal());
    expect(harness.opened.every((entry) => entry.startsWith('DERIVATIVES:'))).toBe(true);
  });
});

describe('provider and persisted metadata are reconciled', () => {
  it('sends the persisted byte size when the provider agrees', async () => {
    const stream = await build({ descriptor: DESCRIPTOR }).service.open(REQUEST, signal());
    expect(stream.contentLengthBytes).toBe(DESCRIPTOR.byteSize);
  });

  it.each([
    ['a larger object', DESCRIPTOR.byteSize + 1],
    ['a smaller object', DESCRIPTOR.byteSize - 1],
    ['a zero-length object', 0],
    ['a negative count', -1],
    ['a non-finite count', Number.NaN],
  ])('refuses to stream %s rather than send a misleading length', async (_label, providerSize) => {
    const harness = build({ descriptor: DESCRIPTOR, providerSize });

    expect(await codeOf(() => harness.service.open(REQUEST, signal()))).toBe(
      'PUBLIC_SIDE_BACKGROUND_UNAVAILABLE',
    );
  });

  it('destroys the opened stream when it refuses, leaving no draining connection', async () => {
    let captured: Readable | undefined;
    const repository: PublicSideBackgroundRepository = {
      findDeliverable: () => Promise.resolve(DESCRIPTOR),
    };
    const storage = {
      getObjectStream: () => {
        captured = Readable.from([BYTES]);
        return Promise.resolve({
          body: captured,
          bucket: 'DERIVATIVES',
          key: DESCRIPTOR.storageKey,
          sizeBytes: DESCRIPTOR.byteSize + 99,
          metadata: {},
        });
      },
    } as unknown as ObjectStoragePort;

    const service = new PublicSideBackgroundService(repository, storage);
    await codeOf(() => service.open(REQUEST, signal()));

    expect(captured?.destroyed).toBe(true);
  });
});

describe('provider failures stay in the safe vocabulary', () => {
  it('reports a missing object as unavailable, never as not-found', async () => {
    // The descriptor resolved, so the Product *is* public and the background
    // *should* exist. A 404 would tell an honest caller to stop asking.
    const harness = build({
      descriptor: DESCRIPTOR,
      failWith: new ObjectStorageError('OBJECT_NOT_FOUND', 'gone'),
    });

    expect(await codeOf(() => harness.service.open(REQUEST, signal()))).toBe(
      'PUBLIC_SIDE_BACKGROUND_UNAVAILABLE',
    );
  });

  it('propagates a client abort as itself', async () => {
    const aborted = new ObjectStorageError('REQUEST_ABORTED', 'client left');
    const harness = build({ descriptor: DESCRIPTOR, failWith: aborted });

    await expect(harness.service.open(REQUEST, signal())).rejects.toBe(aborted);
  });

  it('leaks no storage detail in the error it does surface', async () => {
    const harness = build({
      descriptor: DESCRIPTOR,
      failWith: new ObjectStorageError(
        'PROVIDER_UNAVAILABLE',
        `s3://secret-bucket/${DESCRIPTOR.storageKey}`,
      ),
    });

    let message = '';
    try {
      await harness.service.open(REQUEST, signal());
    } catch (error: unknown) {
      message = (error as Error).message;
    }

    for (const forbidden of ['s3://', 'secret-bucket', DESCRIPTOR.storageKey, 'NORMALIZED']) {
      expect(message).not.toContain(forbidden);
    }
  });
});
