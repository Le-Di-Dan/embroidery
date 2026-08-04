/**
 * The `asset.normalization.requested` payload contract (`IMP-D046` PO-02).
 *
 * The cases that carry the weight are the refusals. A payload that could smuggle
 * a profile, an ownership claim or a second association reference would let a
 * producer decide what the worker validated against — which is the exact
 * property `APP3-G06` exists to remove. Unknown-field rejection is what makes
 * "the payload cannot say that" true rather than aspirational.
 */
import {
  ASSET_NORMALIZATION_EVENT_TYPE,
  ASSET_NORMALIZATION_PAYLOAD_VERSION,
  associationIdOf,
  deriveAssetNormalizationEffectKey,
  parseAssetNormalizationPayload,
} from './asset-normalization.payload';

const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const SIDE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const TEMPLATE_ASSOCIATION = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const SESSION_ASSOCIATION = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';

const valid = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  assetId: ASSET,
  normalizationPolicyVersion: 1,
  associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
  ...overrides,
});

const parse = (raw: unknown, version = 1) => parseAssetNormalizationPayload(raw, version);

describe('the event identity', () => {
  it('is a new type and never the accepted inspection event', () => {
    expect(ASSET_NORMALIZATION_EVENT_TYPE).toBe('asset.normalization.requested');
    expect(ASSET_NORMALIZATION_EVENT_TYPE).not.toBe('asset.inspection.requested');
    expect(ASSET_NORMALIZATION_PAYLOAD_VERSION).toBe(1);
  });
});

describe('a well-formed payload', () => {
  it('accepts each of the three association kinds', () => {
    for (const reference of [
      { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE },
      { kind: 'DESIGN_TEMPLATE_ASSET', designTemplateAssetId: TEMPLATE_ASSOCIATION },
      { kind: 'DESIGN_SESSION_ASSET', designSessionAssetId: SESSION_ASSOCIATION },
    ]) {
      const result = parse(valid({ associationRef: reference }));
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.payload.associationRef).toEqual(reference);
    }
  });

  it('reads the association id whichever kind it is', () => {
    expect(associationIdOf({ kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: SIDE })).toBe(SIDE);
    expect(
      associationIdOf({
        kind: 'DESIGN_SESSION_ASSET',
        designSessionAssetId: SESSION_ASSOCIATION,
      }),
    ).toBe(SESSION_ASSOCIATION);
  });
});

describe('what the payload may not say', () => {
  it('rejects an unknown top-level field', () => {
    for (const extra of [
      { profile: 'SIDE_BACKGROUND' },
      { processingProfile: 'TEMPLATE_ASSET' },
      { ownerId: ASSET },
      { storageKey: 'development/originals/x.png' },
      { sessionSecret: 'secret' },
      { customerId: ASSET },
    ]) {
      const result = parse(valid(extra));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.errorClass).toBe('JOB_PAYLOAD_INVALID');
    }
  });

  it('rejects a second reference alongside the declared one', () => {
    // Two ids would let the producer choose which association the worker
    // validated against — the authorization the discriminator is not allowed to
    // carry.
    const result = parse(
      valid({
        associationRef: {
          kind: 'PRODUCT_SIDE_BACKGROUND',
          productSideId: SIDE,
          designTemplateAssetId: TEMPLATE_ASSOCIATION,
        },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects a reference whose id field does not match its kind', () => {
    const result = parse(
      valid({
        associationRef: { kind: 'DESIGN_TEMPLATE_ASSET', productSideId: SIDE },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects an unknown discriminator', () => {
    for (const kind of ['PRODUCT_MEDIA', 'SIDE_BACKGROUND', '', 'design_session_asset']) {
      expect(parse(valid({ associationRef: { kind, productSideId: SIDE } })).valid).toBe(false);
    }
  });

  it('rejects a missing field', () => {
    for (const field of [
      'schemaVersion',
      'assetId',
      'normalizationPolicyVersion',
      'associationRef',
    ]) {
      const payload = valid();
      delete (payload as Record<string, unknown>)[field];
      expect(parse(payload).valid).toBe(false);
    }
  });

  it('rejects a malformed identifier', () => {
    for (const id of ['not-a-uuid', '', '019A2B3C-4D5E-7F60-8A1B-2C3D4E5F6071', 42]) {
      expect(parse(valid({ assetId: id })).valid).toBe(false);
      expect(
        parse(valid({ associationRef: { kind: 'PRODUCT_SIDE_BACKGROUND', productSideId: id } }))
          .valid,
      ).toBe(false);
    }
  });

  it('rejects a non-object payload', () => {
    for (const raw of [null, undefined, [], 'x', 7]) {
      expect(parse(raw).valid).toBe(false);
    }
  });
});

describe('version disagreement is reported as such', () => {
  it('separates an unsupported envelope version from a malformed payload', () => {
    const result = parse(valid(), 2);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errorClass).toBe('JOB_SCHEMA_UNSUPPORTED');
  });

  it('separates an unsupported body schemaVersion too', () => {
    const result = parse(valid({ schemaVersion: 2 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errorClass).toBe('JOB_SCHEMA_UNSUPPORTED');
  });

  it('accepts a policy version the payload declares, and passes it through', () => {
    // The *handler* validates the schema; the use case is what refuses a policy
    // version it does not implement, so parsing keeps the number rather than
    // hard-coding 1 here.
    const result = parse(valid({ normalizationPolicyVersion: 2 }));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.normalizationPolicyVersion).toBe(2);
  });

  it('rejects a non-integer policy version', () => {
    expect(parse(valid({ normalizationPolicyVersion: '1' })).valid).toBe(false);
    expect(parse(valid({ normalizationPolicyVersion: 1.5 })).valid).toBe(false);
  });
});

describe('the effect key', () => {
  it('is the Asset and the policy version, never the association', () => {
    // Several associations may reference one Asset; keying the effect by
    // association would produce a derivative per association for identical
    // bytes (IMP-D046 PO-08).
    const side = parse(valid());
    const template = parse(
      valid({
        associationRef: {
          kind: 'DESIGN_TEMPLATE_ASSET',
          designTemplateAssetId: TEMPLATE_ASSOCIATION,
        },
      }),
    );
    expect(side.valid && template.valid).toBe(true);
    if (!side.valid || !template.valid) return;

    const key = deriveAssetNormalizationEffectKey(side.payload);
    expect(key).toBe(deriveAssetNormalizationEffectKey(template.payload));
    expect(key).toContain(ASSET);
    expect(key).not.toContain(SIDE);
    expect(key.startsWith('asset-normalization:v1:')).toBe(true);
  });

  it('separates policy versions', () => {
    const first = parse(valid());
    const second = parse(valid({ normalizationPolicyVersion: 2 }));
    if (!first.valid || !second.valid) throw new Error('fixture invalid');
    expect(deriveAssetNormalizationEffectKey(first.payload)).not.toBe(
      deriveAssetNormalizationEffectKey(second.payload),
    );
  });
});
