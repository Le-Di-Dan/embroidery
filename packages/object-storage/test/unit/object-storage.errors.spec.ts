import {
  classifyProviderError,
  ObjectStorageError,
  OBJECT_STORAGE_ERROR_CODES,
  toObjectStorageError,
} from '../../src/index';

/** Shapes the SDK actually throws: a `name`, sometimes a `$metadata.httpStatusCode`. */
function sdkError(name: string, httpStatusCode?: number): unknown {
  const error = new Error(`provider said ${name}`);
  error.name = name;
  return httpStatusCode === undefined
    ? error
    : Object.assign(error, { $metadata: { httpStatusCode } });
}

describe('classifyProviderError', () => {
  it.each([
    ['NoSuchKey', 'OBJECT_NOT_FOUND'],
    ['NotFound', 'OBJECT_NOT_FOUND'],
    ['NoSuchBucket', 'OBJECT_NOT_FOUND'],
    ['AccessDenied', 'ACCESS_DENIED'],
    ['InvalidAccessKeyId', 'ACCESS_DENIED'],
    ['SignatureDoesNotMatch', 'ACCESS_DENIED'],
    ['BucketAlreadyExists', 'CONFLICT'],
    ['BucketAlreadyOwnedByYou', 'CONFLICT'],
    ['AbortError', 'REQUEST_ABORTED'],
    ['TimeoutError', 'PROVIDER_TIMEOUT'],
    ['ServiceUnavailable', 'PROVIDER_UNAVAILABLE'],
    ['SlowDown', 'PROVIDER_UNAVAILABLE'],
  ])('maps SDK error name %s to %s', (name, expected) => {
    expect(classifyProviderError(sdkError(name))).toBe(expected);
  });

  it('classifies a node syscall failure carried on `code` rather than `name`', () => {
    expect(classifyProviderError({ code: 'ECONNREFUSED' })).toBe('PROVIDER_UNAVAILABLE');
  });

  it.each([
    [404, 'OBJECT_NOT_FOUND'],
    [403, 'ACCESS_DENIED'],
    [401, 'ACCESS_DENIED'],
    [409, 'CONFLICT'],
    [412, 'CONFLICT'],
    [408, 'PROVIDER_TIMEOUT'],
    [429, 'PROVIDER_UNAVAILABLE'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [504, 'PROVIDER_TIMEOUT'],
  ])('falls back to HTTP status %s when the name is unrecognised', (status, expected) => {
    expect(classifyProviderError(sdkError('SomethingBrandNew', status))).toBe(expected);
  });

  it('prefers the error name over the HTTP status', () => {
    // A provider may answer a specific condition with a generic status; the
    // name is the more precise signal, so it must win.
    expect(classifyProviderError(sdkError('NoSuchKey', 500))).toBe('OBJECT_NOT_FOUND');
  });

  it.each([[undefined], [null], ['a string'], [42], [{}], [new Error('bare')]])(
    'classifies an unrecognised value (%p) as INVALID_PROVIDER_RESPONSE, never a retryable class',
    (value) => {
      // Guessing an unknown failure into a retryable class would make the
      // caller retry something that can never succeed.
      expect(classifyProviderError(value)).toBe('INVALID_PROVIDER_RESPONSE');
    },
  );

  it('only ever returns a member of the closed taxonomy', () => {
    const codes = ['NoSuchKey', 'AccessDenied', 'Whatever', 'SlowDown'].map((name) =>
      classifyProviderError(sdkError(name)),
    );

    for (const code of codes) {
      expect(OBJECT_STORAGE_ERROR_CODES).toContain(code);
    }
  });
});

describe('toObjectStorageError', () => {
  it('never leaks the raw provider message into the safe message', () => {
    const raw = sdkError('AccessDenied');
    (raw as Error).message =
      'AccessDenied: bucket embroidery-originals endpoint http://minio:9000 key AKIAEXAMPLE';

    const mapped = toObjectStorageError('head object "x"', raw);

    expect(mapped).toBeInstanceOf(ObjectStorageError);
    expect(mapped.code).toBe('ACCESS_DENIED');
    expect(mapped.message).toBe('Object storage head object "x" failed (ACCESS_DENIED).');
    expect(mapped.message).not.toContain('AKIAEXAMPLE');
    expect(mapped.message).not.toContain('minio:9000');
  });

  it('preserves the original error as `cause` for debugging', () => {
    const raw = sdkError('NoSuchKey');

    expect(toObjectStorageError('get object "x"', raw).cause).toBe(raw);
  });

  it('passes an already-mapped error through unchanged', () => {
    // Re-wrapping would nest causes and rewrite the operation of the inner
    // failure, losing where the error actually originated.
    const already = new ObjectStorageError('CONFLICT', 'Object storage put failed (CONFLICT).');

    expect(toObjectStorageError('put object "x"', already)).toBe(already);
  });

  it('is named so a consumer can discriminate it without importing the class', () => {
    expect(toObjectStorageError('list objects "p/"', sdkError('SlowDown')).name).toBe(
      'ObjectStorageError',
    );
  });
});
