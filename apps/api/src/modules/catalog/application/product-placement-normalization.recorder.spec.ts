/**
 * What the producer actually appends (`APP3-B01N`).
 *
 * The payload is the contract's, not this module's, so what is worth asserting
 * is that the producer did not add to it, did not restate a version, and did not
 * smuggle a profile — the one field `IMP-D046` PO-03 reserves for the consumer.
 */
import {
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_POLICY_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
} from '@embroidery/domain-types';
import type { OutboxEventStore } from '@embroidery/persistence';

import { ProductPlacementNormalizationRecorder } from './product-placement-normalization.recorder';

const SIDE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6001';
const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f7001';

interface Appended {
  readonly eventType: string;
  readonly aggregateKind: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly payloadSchemaVersion: number;
}

function build(): { recorder: ProductPlacementNormalizationRecorder; appended: Appended[] } {
  const appended: Appended[] = [];
  const outbox = {
    append: (input: Appended) => {
      appended.push(input);
      return Promise.resolve(1n);
    },
  } as unknown as OutboxEventStore;
  return { recorder: new ProductPlacementNormalizationRecorder(outbox), appended };
}

describe('ProductPlacementNormalizationRecorder', () => {
  it('appends the shared event type against the Asset aggregate', async () => {
    const { recorder, appended } = build();
    await recorder.record([{ productSideId: SIDE, assetId: ASSET }]);

    expect(appended).toHaveLength(1);
    expect(appended[0]?.eventType).toBe(ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE);
    expect(appended[0]?.aggregateKind).toBe('ASSET');
    expect(appended[0]?.aggregateId).toBe(ASSET);
    expect(appended[0]?.payloadSchemaVersion).toBe(ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION);
  });

  it('builds exactly the v1 payload and nothing more', async () => {
    const { recorder, appended } = build();
    await recorder.record([{ productSideId: SIDE, assetId: ASSET }]);

    expect(appended[0]?.payload).toEqual({
      schemaVersion: 1,
      assetId: ASSET,
      normalizationPolicyVersion: ASSET_NORMALIZATION_POLICY_VERSION,
      associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
    });
    expect(Object.keys(appended[0]?.payload ?? {}).sort()).toEqual([
      'assetId',
      'associationRef',
      'normalizationPolicyVersion',
      'schemaVersion',
    ]);
  });

  it('carries no profile, key, owner or secret', async () => {
    const { recorder, appended } = build();
    await recorder.record([{ productSideId: SIDE, assetId: ASSET }]);

    const serialized = JSON.stringify(appended[0]?.payload);
    for (const forbidden of ['profile', 'storageKey', 'ownerId', 'secret', 'url', 'mediaType']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('appends one event per intent, in the order given', async () => {
    const { recorder, appended } = build();
    const second = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6002';
    await recorder.record([
      { productSideId: SIDE, assetId: ASSET },
      { productSideId: second, assetId: ASSET },
    ]);

    expect(appended).toHaveLength(2);
    expect(appended.map((event) => event.payload['associationRef'])).toEqual([
      { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
      { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: second },
    ]);
  });

  it('appends nothing for an empty plan', async () => {
    const { recorder, appended } = build();
    await recorder.record([]);
    expect(appended).toEqual([]);
  });
});
