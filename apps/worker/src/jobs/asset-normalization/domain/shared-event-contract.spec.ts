/**
 * The consumer still agrees with the shared contract (`APP3-B01N`).
 *
 * `APP3-W01A` shipped with the event vocabulary declared inside this job. A
 * producer now exists in another application, so the vocabulary moved to
 * `@embroidery/domain-types` and both sides import it. These cases exist to
 * catch the way that arrangement fails: not with a compile error, but with the
 * consumer quietly keeping its own copy of a constant the producer has moved on
 * from, so a perfectly valid event stops being parsed and the derivative simply
 * never appears.
 *
 * The producer itself is deliberately absent here — importing the API into the
 * worker is exactly the coupling the shared package exists to avoid. What is
 * proven is that the *shared builder's* output is accepted; the API integration
 * suite proves the committed row equals that builder's output, and the two
 * together close the chain.
 */
import {
  ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS,
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_POLICY_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';

import {
  ASSET_NORMALIZATION_EVENT_TYPE,
  ASSET_NORMALIZATION_PAYLOAD_VERSION,
  ASSOCIATION_REF_FIELDS,
  parseAssetNormalizationPayload,
} from './asset-normalization.payload';
import { NORMALIZATION_POLICY_VERSION } from './normalization-policy';

const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f7001';
const SIDE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6001';

describe('the shared normalization event contract', () => {
  it('is the same event type on both sides', () => {
    expect(ASSET_NORMALIZATION_EVENT_TYPE).toBe(ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE);
    expect(ASSET_NORMALIZATION_EVENT_TYPE).toBe('asset.normalization.requested');
  });

  it('is the same schema and policy version on both sides', () => {
    expect(ASSET_NORMALIZATION_PAYLOAD_VERSION).toBe(ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION);
    expect(NORMALIZATION_POLICY_VERSION).toBe(ASSET_NORMALIZATION_POLICY_VERSION);
    expect(ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION).toBe(1);
    expect(ASSET_NORMALIZATION_POLICY_VERSION).toBe(1);
  });

  it('is the same association discriminator on both sides', () => {
    expect(ASSOCIATION_REF_FIELDS).toBe(ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS);
    expect(ASSOCIATION_REF_FIELDS).toEqual({
      PRODUCT_SIDE_BACKGROUND: 'productSideId',
      DESIGN_TEMPLATE_ASSET: 'designTemplateAssetId',
      DESIGN_SESSION_ASSET: 'designSessionAssetId',
    });
  });

  it('accepts a payload built by the shared builder', () => {
    const payload = buildAssetNormalizationRequestedPayload({
      assetId: ASSET,
      associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
    });
    const result = parseAssetNormalizationPayload(
      JSON.parse(JSON.stringify(payload)),
      ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.assetId).toBe(ASSET);
      expect(result.payload.normalizationPolicyVersion).toBe(NORMALIZATION_POLICY_VERSION);
      expect(result.payload.associationRef).toEqual({
        kind: 'PRODUCT_SIDE_BACKGROUND',
        productSideId: SIDE,
      });
    }
  });

  it('accepts the builder for every authorized association kind', () => {
    for (const [kind, field] of Object.entries(ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS)) {
      const payload = buildAssetNormalizationRequestedPayload({
        assetId: ASSET,
        // The builder takes the reference whole, so the discriminated union is
        // the only thing deciding which field is legal.
        associationRef: { kind, [field]: SIDE } as never,
      });
      expect(parseAssetNormalizationPayload(payload, 1).valid).toBe(true);
    }
  });

  it('still refuses a field the builder cannot produce', () => {
    // The builder has no parameter for a profile; this is what would happen if
    // someone appended one by hand anyway.
    const payload = {
      ...buildAssetNormalizationRequestedPayload({
        assetId: ASSET,
        associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
      }),
      profile: 'SIDE_BACKGROUND',
    };
    const result = parseAssetNormalizationPayload(payload, 1);

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errorClass).toBe('JOB_PAYLOAD_INVALID');
  });
});
