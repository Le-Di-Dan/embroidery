/**
 * APP2-I03 §5/§9/§12 — the API's bootstrap contract.
 *
 * Memoization is the interesting property: two callers must await one attempt,
 * because two attempts means two concurrent `CreateBucket` calls against the
 * same name, which is the race §10 exists to avoid.
 */
import { ObjectStorageConfigError, ObjectStorageError } from '@embroidery/object-storage';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { ObjectStorageBootstrapService } from './object-storage-bootstrap.service';
import {
  ObjectStorageBootstrapError,
  classifyObjectStorageBootstrapFailure,
} from './object-storage-bootstrap.errors';

interface StorageDouble {
  readonly port: ObjectStoragePort;
  readonly calls: () => number;
  settle: (() => void) | undefined;
}

function storageDouble(behaviour: 'ok' | 'defer' | Error = 'ok'): StorageDouble {
  let calls = 0;
  const double: StorageDouble = {
    calls: () => calls,
    settle: undefined,
    port: {
      ensurePrivateBuckets: async (): Promise<void> => {
        calls += 1;
        if (behaviour instanceof Error) {
          return Promise.reject(behaviour);
        }
        if (behaviour === 'defer') {
          return new Promise<void>((resolve) => {
            double.settle = resolve;
          });
        }
        return Promise.resolve();
      },
    } as unknown as ObjectStoragePort,
  };
  return double;
}

describe('API object-storage bootstrap', () => {
  it('calls ensurePrivateBuckets once and reports ready', async () => {
    const storage = storageDouble();
    const service = new ObjectStorageBootstrapService(storage.port);

    expect(service.isReady()).toBe(false);
    await service.initialize();

    expect(storage.calls()).toBe(1);
    expect(service.isReady()).toBe(true);
  });

  it('shares one promise across concurrent callers', async () => {
    const storage = storageDouble('defer');
    const service = new ObjectStorageBootstrapService(storage.port);

    const first = service.initialize();
    const second = service.initialize();
    const third = service.initialize();
    expect(storage.calls()).toBe(1);

    storage.settle?.();
    await Promise.all([first, second, third]);

    expect(storage.calls()).toBe(1);
    expect(service.isReady()).toBe(true);
  });

  it('is sticky: a later call does not re-check', async () => {
    const storage = storageDouble();
    const service = new ObjectStorageBootstrapService(storage.port);

    await service.initialize();
    await service.initialize();

    expect(storage.calls()).toBe(1);
  });

  it('never reports ready after a failure', async () => {
    const storage = storageDouble(new ObjectStorageError('ACCESS_DENIED', 'denied'));
    const service = new ObjectStorageBootstrapService(storage.port);

    await expect(service.initialize()).rejects.toBeInstanceOf(ObjectStorageBootstrapError);
    expect(service.isReady()).toBe(false);
  });

  it('surfaces the safe class, not the provider message', async () => {
    const storage = storageDouble(
      new ObjectStorageError('PROVIDER_UNAVAILABLE', 'connect ECONNREFUSED 10.0.0.5:9000'),
    );
    const service = new ObjectStorageBootstrapService(storage.port);

    await expect(service.initialize()).rejects.toMatchObject({
      errorClass: 'OBJECT_STORAGE_UNAVAILABLE',
      message: 'Private object-storage bucket bootstrap failed (OBJECT_STORAGE_UNAVAILABLE).',
    });
  });

  it('lets a fresh attempt run after a failure', async () => {
    // A cached rejection would make a supervisor's restart meaningless — the
    // process must be able to try again, without retrying on its own.
    let attempt = 0;
    const port = {
      ensurePrivateBuckets: async (): Promise<void> => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject(new ObjectStorageError('PROVIDER_UNAVAILABLE', 'down'));
        }
        return Promise.resolve();
      },
    } as unknown as ObjectStoragePort;
    const service = new ObjectStorageBootstrapService(port);

    await expect(service.initialize()).rejects.toBeInstanceOf(ObjectStorageBootstrapError);
    await service.initialize();

    expect(attempt).toBe(2);
    expect(service.isReady()).toBe(true);
  });
});

describe('bootstrap failure classification', () => {
  it.each([
    ['ACCESS_DENIED', 'OBJECT_STORAGE_ACCESS_DENIED'],
    ['PROVIDER_UNAVAILABLE', 'OBJECT_STORAGE_UNAVAILABLE'],
    ['PROVIDER_TIMEOUT', 'OBJECT_STORAGE_UNAVAILABLE'],
    ['REQUEST_ABORTED', 'OBJECT_STORAGE_UNAVAILABLE'],
    ['INVALID_PROVIDER_RESPONSE', 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE'],
    ['OBJECT_NOT_FOUND', 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE'],
    ['CONFLICT', 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE'],
  ] as const)('maps %s to %s', (code, expected) => {
    expect(classifyObjectStorageBootstrapFailure(new ObjectStorageError(code, 'x'))).toBe(expected);
  });

  it('maps a configuration error to the configuration class', () => {
    expect(
      classifyObjectStorageBootstrapFailure(new ObjectStorageConfigError('missing endpoint')),
    ).toBe('OBJECT_STORAGE_CONFIGURATION_INVALID');
  });

  it('never guesses an unknown failure into a retryable class', () => {
    expect(classifyObjectStorageBootstrapFailure(new Error('something else'))).toBe(
      'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE',
    );
  });

  it('carries no provider detail in the safe message', () => {
    const failure = new ObjectStorageBootstrapError('OBJECT_STORAGE_ACCESS_DENIED', {
      endpoint: 'http://minio:9000',
      accessKeyId: 'AKIAEXAMPLE',
    });

    expect(failure.message).toBe(
      'Private object-storage bucket bootstrap failed (OBJECT_STORAGE_ACCESS_DENIED).',
    );
    expect(failure.message).not.toContain('minio');
    expect(failure.message).not.toContain('AKIA');
  });
});
