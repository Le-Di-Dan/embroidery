import { RequestContextService, RequestContextUnavailableError } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('exposes the context inside a synchronous callback', () => {
    service.run({ requestId: 'sync-1' }, () => {
      expect(service.get()).toEqual({ requestId: 'sync-1' });
      expect(service.getRequestId()).toBe('sync-1');
      expect(service.requireRequestId()).toBe('sync-1');
    });
  });

  it('preserves the context across an awaited promise', async () => {
    await service.run({ requestId: 'async-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(service.getRequestId()).toBe('async-1');
      await Promise.resolve();
      expect(service.getRequestId()).toBe('async-1');
    });
  });

  it('preserves the context through a nested service call chain', async () => {
    const deepest = (): string => service.requireRequestId();
    const middle = async (): Promise<string> => {
      await new Promise((resolve) => setImmediate(resolve));
      return deepest();
    };

    const observed = await service.run({ requestId: 'deep-1' }, async () => middle());
    expect(observed).toBe('deep-1');
  });

  it('returns undefined from optional accessors outside a request', () => {
    expect(service.get()).toBeUndefined();
    expect(service.getRequestId()).toBeUndefined();
  });

  it('throws an actionable error from the required accessor outside a request', () => {
    expect(() => service.requireRequestId()).toThrow(RequestContextUnavailableError);
    expect(() => service.requireRequestId()).toThrow(/No request context is active/);
  });

  it('restores the outer context after a nested run', () => {
    service.run({ requestId: 'outer' }, () => {
      service.run({ requestId: 'inner' }, () => {
        expect(service.getRequestId()).toBe('inner');
      });
      expect(service.getRequestId()).toBe('outer');
    });
    expect(service.getRequestId()).toBeUndefined();
  });

  it('does not leak the context after a callback throws', () => {
    expect(() => {
      service.run({ requestId: 'boom' }, () => {
        throw new Error('handler failed');
      });
    }).toThrow('handler failed');

    expect(service.getRequestId()).toBeUndefined();
  });

  it('does not leak the context after a rejected async callback', async () => {
    await expect(
      service.run({ requestId: 'boom-async' }, async () => {
        await Promise.resolve();
        throw new Error('async handler failed');
      }),
    ).rejects.toThrow('async handler failed');

    expect(service.getRequestId()).toBeUndefined();
  });

  it('isolates concurrently interleaved contexts', async () => {
    const observe = async (requestId: string, delayMs: number): Promise<string> =>
      service.run({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return service.requireRequestId();
      });

    // The slowest starts first: if the store leaked, it would observe a later id.
    const results = await Promise.all([
      observe('slow', 30),
      observe('medium', 15),
      observe('fast', 1),
    ]);

    expect(results).toEqual(['slow', 'medium', 'fast']);
  });
});
