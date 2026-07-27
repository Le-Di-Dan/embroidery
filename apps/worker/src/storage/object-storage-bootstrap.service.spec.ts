/**
 * APP2-I03 §5/§9/§13 — the worker's bootstrap gate.
 *
 * The worker's contract differs from the API's in one deliberate way: a failure
 * is a *result*, not a throw. The process must stay up, unready and idle, so
 * the failure has to travel as data through the gate rather than as an
 * exception unwinding Nest initialization.
 */
import { ObjectStorageConfigError, ObjectStorageError } from '@embroidery/object-storage';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { ObjectStorageBootstrapService } from './object-storage-bootstrap.service';
import { classifyObjectStorageBootstrapFailure } from './object-storage-bootstrap.errors';

function portThat(behaviour: 'ok' | 'defer' | Error): {
  port: ObjectStoragePort;
  calls: () => number;
  settle: () => void;
} {
  let calls = 0;
  let release: (() => void) | undefined;
  const port = {
    ensurePrivateBuckets: async (): Promise<void> => {
      calls += 1;
      if (behaviour instanceof Error) {
        return Promise.reject(behaviour);
      }
      if (behaviour === 'defer') {
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve();
    },
  } as unknown as ObjectStoragePort;
  return {
    port,
    calls: () => calls,
    settle: () => {
      release?.();
    },
  };
}

describe('worker object-storage bootstrap gate', () => {
  it('opens the gate and reports ready', async () => {
    const storage = portThat('ok');
    const service = new ObjectStorageBootstrapService(storage.port);

    await expect(service.ensureReady()).resolves.toEqual({ ok: true });
    expect(service.isReady()).toBe(true);
    expect(storage.calls()).toBe(1);
  });

  it('shares one attempt across concurrent callers', async () => {
    const storage = portThat('defer');
    const service = new ObjectStorageBootstrapService(storage.port);

    const first = service.ensureReady();
    const second = service.ensureReady();
    expect(storage.calls()).toBe(1);

    storage.settle();
    await Promise.all([first, second]);

    expect(storage.calls()).toBe(1);
  });

  it('closes the gate with a safe class instead of throwing', async () => {
    const storage = portThat(
      new ObjectStorageError('PROVIDER_UNAVAILABLE', 'connect ECONNREFUSED 10.0.0.5:9000'),
    );
    const service = new ObjectStorageBootstrapService(storage.port);

    const result = await service.ensureReady();

    expect(result).toEqual({ ok: false, errorClass: 'OBJECT_STORAGE_UNAVAILABLE' });
    expect(service.isReady()).toBe(false);
  });

  it('does not swallow an access-denied failure', async () => {
    // A denied request must never look like "unavailable": one is a
    // credentials/ownership problem an operator has to fix, the other invites a
    // restart.
    const storage = portThat(new ObjectStorageError('ACCESS_DENIED', 'denied'));
    const service = new ObjectStorageBootstrapService(storage.port);

    await expect(service.ensureReady()).resolves.toEqual({
      ok: false,
      errorClass: 'OBJECT_STORAGE_ACCESS_DENIED',
    });
  });

  it('reports an unknown failure as an invalid response, never as retryable', () => {
    expect(classifyObjectStorageBootstrapFailure(new Error('mystery'))).toBe(
      'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE',
    );
    expect(classifyObjectStorageBootstrapFailure(new ObjectStorageConfigError('bad'))).toBe(
      'OBJECT_STORAGE_CONFIGURATION_INVALID',
    );
  });

  it('throws the safe class from initialize()', async () => {
    const storage = portThat(new ObjectStorageError('ACCESS_DENIED', 'denied by policy'));
    const service = new ObjectStorageBootstrapService(storage.port);

    await expect(service.initialize()).rejects.toMatchObject({
      errorClass: 'OBJECT_STORAGE_ACCESS_DENIED',
      message: 'Private object-storage bucket bootstrap failed (OBJECT_STORAGE_ACCESS_DENIED).',
    });
  });
});
