import {
  DEFAULT_PART_SIZE_BYTES,
  DEFAULT_QUEUE_SIZE,
  MAX_PART_SIZE_BYTES,
  MAX_QUEUE_SIZE,
  MIN_PART_SIZE_BYTES,
  ObjectStorageConfigError,
  resolveMultipartOptions,
} from '../../src/index';

const MIB = 1024 * 1024;

describe('resolveMultipartOptions', () => {
  it('applies the reviewed defaults when no override is given', () => {
    expect(resolveMultipartOptions(undefined)).toEqual({
      partSizeBytes: 5 * MIB,
      queueSize: 2,
      approximateBufferedBytes: 10 * MIB,
    });
  });

  it('locks the documented defaults so a silent retune cannot pass review', () => {
    expect(DEFAULT_PART_SIZE_BYTES).toBe(5 * MIB);
    expect(DEFAULT_QUEUE_SIZE).toBe(2);
  });

  it('reports approximate buffering as partSize x queueSize', () => {
    // The honest bound (§10): in-flight part buffering only. It deliberately
    // excludes socket, TLS and runtime overhead, so it is not a memory cap.
    const resolved = resolveMultipartOptions({ partSizeBytes: 8 * MIB, queueSize: 3 });

    expect(resolved.approximateBufferedBytes).toBe(24 * MIB);
  });

  it('accepts an explicit override inside the provider bounds', () => {
    expect(resolveMultipartOptions({ partSizeBytes: 16 * MIB, queueSize: 4 })).toEqual({
      partSizeBytes: 16 * MIB,
      queueSize: 4,
      approximateBufferedBytes: 64 * MIB,
    });
  });

  it('accepts each boundary value exactly', () => {
    expect(resolveMultipartOptions({ partSizeBytes: MIN_PART_SIZE_BYTES }).partSizeBytes).toBe(
      MIN_PART_SIZE_BYTES,
    );
    expect(resolveMultipartOptions({ partSizeBytes: MAX_PART_SIZE_BYTES }).partSizeBytes).toBe(
      MAX_PART_SIZE_BYTES,
    );
    expect(resolveMultipartOptions({ queueSize: 1 }).queueSize).toBe(1);
    expect(resolveMultipartOptions({ queueSize: MAX_QUEUE_SIZE }).queueSize).toBe(MAX_QUEUE_SIZE);
  });

  it('rejects a part size below the 5 MiB provider floor', () => {
    // Under the floor the provider rejects every non-final part mid-upload,
    // which would surface as an opaque failure after streaming has begun.
    expect(() => resolveMultipartOptions({ partSizeBytes: MIN_PART_SIZE_BYTES - 1 })).toThrow(
      ObjectStorageConfigError,
    );
  });

  it('rejects a part size above the provider ceiling', () => {
    expect(() => resolveMultipartOptions({ partSizeBytes: MAX_PART_SIZE_BYTES + 1 })).toThrow(
      ObjectStorageConfigError,
    );
  });

  it.each([[0], [-1], [MAX_QUEUE_SIZE + 1]])('rejects queue size %p', (queueSize) => {
    expect(() => resolveMultipartOptions({ queueSize })).toThrow(ObjectStorageConfigError);
  });

  it.each([
    [1.5, 'a fraction'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
  ])('rejects %p (%s) as a part size', (partSizeBytes) => {
    expect(() => resolveMultipartOptions({ partSizeBytes })).toThrow(ObjectStorageConfigError);
  });

  it('rejects a fractional queue size', () => {
    expect(() => resolveMultipartOptions({ queueSize: 2.5 })).toThrow(ObjectStorageConfigError);
  });

  it('reports a tuning mistake as configuration, never as a provider failure', () => {
    // A retryable provider classification would make a caller retry a value
    // that can never work.
    expect(() => resolveMultipartOptions({ queueSize: 0 })).toThrow(
      /Invalid multipart queueSize 0: expected an integer between 1 and 16\./,
    );
  });
});
