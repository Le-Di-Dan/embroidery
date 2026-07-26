import { JobHandlerRegistry } from './job-handler.registry';
import type { JobHandler } from './job-handler';

function handlerFor(eventType: string): JobHandler {
  return {
    eventType,
    jobKind: 'OUTBOX_DISPATCH',
    payloadSchemaVersion: 1,
    validatePayload: (payload) => ({ valid: true, payload }),
    deriveEffectKey: (_payload, id) => `effect:${id.toString()}`,
    execute: () => Promise.resolve(),
  };
}

describe('job handler registry', () => {
  let registry: JobHandlerRegistry;

  beforeEach(() => {
    registry = new JobHandlerRegistry();
  });

  it('an empty registry claims nothing rather than everything', () => {
    expect(registry.size).toBe(0);
    expect(registry.registeredTypes()).toEqual([]);
  });

  it('resolves a registered handler by event type', () => {
    const handler = handlerFor('app2.i02.synthetic.alpha');
    registry.register(handler);

    expect(registry.resolve('app2.i02.synthetic.alpha')).toBe(handler);
    expect(registry.resolve('app2.i02.synthetic.beta')).toBeUndefined();
  });

  it('fails loudly on a duplicate event type', () => {
    registry.register(handlerFor('app2.i02.synthetic.alpha'));

    // Startup failure is the point: silently keeping one of the two would make
    // behaviour depend on module load order.
    expect(() => {
      registry.register(handlerFor('app2.i02.synthetic.alpha'));
    }).toThrow(/exactly one handler/);
  });

  it('exposes the claim filter as event-type/job-kind pairs', () => {
    registry.registerAll([
      handlerFor('app2.i02.synthetic.alpha'),
      handlerFor('app2.i02.synthetic.beta'),
    ]);

    expect(registry.registeredTypes()).toEqual([
      { eventType: 'app2.i02.synthetic.alpha', jobKind: 'OUTBOX_DISPATCH' },
      { eventType: 'app2.i02.synthetic.beta', jobKind: 'OUTBOX_DISPATCH' },
    ]);
  });

  it('leaves nothing registered after a clear', () => {
    registry.register(handlerFor('app2.i02.synthetic.alpha'));
    registry.clear();

    expect(registry.registeredTypes()).toEqual([]);
  });
});
