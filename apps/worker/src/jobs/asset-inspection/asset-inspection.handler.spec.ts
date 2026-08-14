import { BACKGROUND_JOB_KINDS } from '@embroidery/persistence';

import { JobHandlerRegistry } from '../../runtime/registry/job-handler.registry';
import { MAX_EFFECT_KEY_LENGTH } from '../../runtime/registry/job-handler';
import { AssetInspectionHandler } from './asset-inspection.handler';
import type { AssetInspectionUseCase } from './application/asset-inspection.usecase';

const ASSET_ID = '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84';

function build(): { handler: AssetInspectionHandler; inspected: unknown[] } {
  const inspected: unknown[] = [];
  const useCase = {
    inspect: (context: unknown): Promise<void> => {
      inspected.push(context);
      return Promise.resolve();
    },
  } as unknown as AssetInspectionUseCase;
  return { handler: new AssetInspectionHandler(useCase), inspected };
}

describe('AssetInspectionHandler', () => {
  it('declares the B01 event type, the domain job kind and schema version 1', () => {
    const { handler } = build();

    expect(handler.eventType).toBe('asset.inspection.requested');
    expect(handler.jobKind).toBe('ASSET_PROCESSING');
    expect(handler.payloadSchemaVersion).toBe(1);
  });

  it('files its evidence under a canonical background job kind', () => {
    const { handler } = build();

    // A kind the attempt store would refuse is a defect that only shows up as a
    // failed reclaim in production.
    expect(BACKGROUND_JOB_KINDS).toContain(handler.jobKind);
  });

  it('is not filed under the transport kind the I02 suites use', () => {
    const { handler } = build();

    expect(handler.jobKind).not.toBe('OUTBOX_DISPATCH');
  });

  it('registers as the only handler for its event type', () => {
    const registry = new JobHandlerRegistry();
    const { handler } = build();

    registry.register(handler);

    expect(registry.size).toBe(1);
    expect(registry.registeredTypes()).toEqual([
      { eventType: 'asset.inspection.requested', jobKind: 'ASSET_PROCESSING' },
    ]);
    expect(registry.resolve('asset.inspection.requested')).toBe(handler);
  });

  it('refuses a second registration for the same event type', () => {
    const registry = new JobHandlerRegistry();
    registry.register(build().handler);

    expect(() => registry.register(build().handler)).toThrow(/Two handlers are registered/);
  });

  it('validates the payload through the domain contract', () => {
    const { handler } = build();

    expect(handler.validatePayload({ schemaVersion: 1, assetId: ASSET_ID }, 1)).toEqual({
      valid: true,
      payload: { schemaVersion: 1, assetId: ASSET_ID },
    });
    expect(handler.validatePayload({ schemaVersion: 1, assetId: 'nope' }, 1)).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });

  it('derives a bounded effect key from the asset alone', () => {
    const { handler } = build();
    const key = handler.deriveEffectKey({ schemaVersion: 1, assetId: ASSET_ID });

    expect(key).toBe(`asset-inspection:v1:${ASSET_ID}`);
    expect(key.length).toBeGreaterThan(0);
    expect(key.length).toBeLessThanOrEqual(MAX_EFFECT_KEY_LENGTH);
  });

  it('passes the asset and the attempt number to the use case', async () => {
    const { handler, inspected } = build();
    const signal = new AbortController().signal;

    await handler.execute(
      { schemaVersion: 1, assetId: ASSET_ID },
      {
        outboxEventId: 42n,
        aggregateKind: 'ASSET',
        aggregateId: ASSET_ID,
        attemptNo: 3,
        workerInstanceId: 'worker-1',
        correlationId: 'corr-1',
        effectKey: `asset-inspection:v1:${ASSET_ID}`,
      },
      signal,
    );

    expect(inspected).toEqual([{ assetId: ASSET_ID, attemptNo: 3 }]);
  });
});
