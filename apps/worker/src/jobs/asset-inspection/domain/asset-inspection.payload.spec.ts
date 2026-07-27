import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
  deriveAssetInspectionEffectKey,
  parseAssetInspectionPayload,
} from './asset-inspection.payload';

const ASSET_ID = '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84';

function parse(payload: unknown, version = 1): ReturnType<typeof parseAssetInspectionPayload> {
  return parseAssetInspectionPayload(payload, version);
}

describe('asset.inspection.requested payload', () => {
  it('names the event type B01 Tx B appends', () => {
    expect(ASSET_INSPECTION_EVENT_TYPE).toBe('asset.inspection.requested');
    expect(ASSET_INSPECTION_PAYLOAD_VERSION).toBe(1);
  });

  it('accepts exactly the two contracted fields', () => {
    const result = parse({ schemaVersion: 1, assetId: ASSET_ID });

    expect(result.valid).toBe(true);
    expect(result.valid && result.payload).toEqual({ schemaVersion: 1, assetId: ASSET_ID });
  });

  it('rejects an unknown field rather than ignoring it', () => {
    // Ignoring it would mean silently discarding whatever the producer believed
    // it was asking for.
    const result = parse({ schemaVersion: 1, assetId: ASSET_ID, force: true });

    expect(result).toEqual({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' });
  });

  it('rejects a missing field', () => {
    expect(parse({ schemaVersion: 1 })).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
    expect(parse({ assetId: ASSET_ID })).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });

  it.each([
    ['null', null],
    ['an array', [{ schemaVersion: 1, assetId: ASSET_ID }]],
    ['a string', JSON.stringify({ schemaVersion: 1, assetId: ASSET_ID })],
    ['a number', 7],
  ])('rejects %s', (_label, payload) => {
    expect(parse(payload)).toEqual({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' });
  });

  it.each([
    ['a UUIDv4', '2f1c6a2e-5f4b-4c3d-8e9a-1b2c3d4e5f60'],
    ['uppercase', ASSET_ID.toUpperCase()],
    ['a truncated id', ASSET_ID.slice(0, 20)],
    ['an empty string', ''],
  ])('rejects %s as an assetId', (_label, assetId) => {
    // The id becomes an object-key segment, so a non-UUIDv7 is a terminal
    // payload rejection here rather than an `ObjectKeyError` mid-attempt.
    expect(parse({ schemaVersion: 1, assetId })).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });

  it('separates an unsupported schema version from an invalid payload', () => {
    expect(parse({ schemaVersion: 2, assetId: ASSET_ID }, 2)).toEqual({
      valid: false,
      errorClass: 'JOB_SCHEMA_UNSUPPORTED',
    });
    expect(parse({ schemaVersion: 1, assetId: ASSET_ID }, 2)).toEqual({
      valid: false,
      errorClass: 'JOB_SCHEMA_UNSUPPORTED',
    });
  });

  it('rejects an envelope version that disagrees with the body', () => {
    expect(parse({ schemaVersion: 2, assetId: ASSET_ID }, 1)).toEqual({
      valid: false,
      errorClass: 'JOB_SCHEMA_UNSUPPORTED',
    });
  });
});

describe('effect key', () => {
  it('is the versioned asset identity', () => {
    expect(deriveAssetInspectionEffectKey({ schemaVersion: 1, assetId: ASSET_ID })).toBe(
      `asset-inspection:v1:${ASSET_ID}`,
    );
  });

  it('stays well inside the runtime bound', () => {
    expect(
      deriveAssetInspectionEffectKey({ schemaVersion: 1, assetId: ASSET_ID }).length,
    ).toBeLessThanOrEqual(200);
  });

  it('carries no payload, key, filename or checksum', () => {
    const key = deriveAssetInspectionEffectKey({ schemaVersion: 1, assetId: ASSET_ID });

    expect(key).not.toContain('originals');
    expect(key).not.toContain('sha256');
    expect(key).not.toContain('{');
  });

  it('is stable across attempts of the same asset', () => {
    const first = deriveAssetInspectionEffectKey({ schemaVersion: 1, assetId: ASSET_ID });
    const second = deriveAssetInspectionEffectKey({ schemaVersion: 1, assetId: ASSET_ID });

    expect(first).toBe(second);
  });
});
