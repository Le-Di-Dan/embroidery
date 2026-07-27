/**
 * APP2-I03 §6/§12 — the API startup ordering, asserted rather than described.
 *
 * The whole point of the checkpoint is a guarantee about *order*: buckets
 * before the port. A test that only checked "bootstrap was called" would pass
 * on an API that listened first and verified afterwards.
 */
import { startApi } from './start-api';

interface Recorder {
  readonly calls: string[];
  readonly errors: unknown[];
}

function dependenciesFor(
  recorder: Recorder,
  options: { readonly bootstrapFails?: Error } = {},
): Parameters<typeof startApi>[0] {
  return {
    bootstrapStorage: async () => {
      recorder.calls.push('bootstrapStorage');
      if (options.bootstrapFails !== undefined) {
        return Promise.reject(options.bootstrapFails);
      }
      return Promise.resolve();
    },
    listen: async () => {
      recorder.calls.push('listen');
      return Promise.resolve();
    },
    close: async () => {
      recorder.calls.push('close');
      return Promise.resolve();
    },
    onError: (error: unknown) => {
      recorder.errors.push(error);
    },
  };
}

describe('API startup sequence', () => {
  let recorder: Recorder;

  beforeEach(() => {
    recorder = { calls: [], errors: [] };
  });

  it('verifies the private buckets before it listens', async () => {
    const listening = await startApi(dependenciesFor(recorder));

    expect(listening).toBe(true);
    expect(recorder.calls).toEqual(['bootstrapStorage', 'listen']);
  });

  it('calls the bootstrap exactly once on a successful start', async () => {
    await startApi(dependenciesFor(recorder));

    expect(recorder.calls.filter((call) => call === 'bootstrapStorage')).toHaveLength(1);
  });

  it('never listens when the bootstrap fails', async () => {
    const failure = new Error('Private object-storage bucket bootstrap failed (X).');

    const listening = await startApi(dependenciesFor(recorder, { bootstrapFails: failure }));

    expect(listening).toBe(false);
    expect(recorder.calls).not.toContain('listen');
  });

  it('closes the application exactly once on failure', async () => {
    const failure = new Error('boom');

    await startApi(dependenciesFor(recorder, { bootstrapFails: failure }));

    expect(recorder.calls.filter((call) => call === 'close')).toHaveLength(1);
    expect(recorder.calls).toEqual(['bootstrapStorage', 'close']);
  });

  it('reports the failure through the caller-supplied handler', async () => {
    const failure = new Error('boom');

    await startApi(dependenciesFor(recorder, { bootstrapFails: failure }));

    expect(recorder.errors).toEqual([failure]);
  });

  it('does not close a successfully started application', async () => {
    // Closing here would tear down the context that just started serving.
    await startApi(dependenciesFor(recorder));

    expect(recorder.calls).not.toContain('close');
  });

  it('performs no retry loop of its own', async () => {
    // A bounded retry already exists in the SDK; a startup that spins forever
    // is indistinguishable from a healthy one to an orchestrator.
    await startApi(dependenciesFor(recorder, { bootstrapFails: new Error('boom') }));

    expect(recorder.calls.filter((call) => call === 'bootstrapStorage')).toHaveLength(1);
  });
});
