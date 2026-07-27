/**
 * The strict result codecs.
 *
 * A stored result is the only input that can make the service resurrect an
 * asset identity or hand back someone else's receipt, so the cases below are
 * mostly about what must be *refused*: unknown fields, wrong discriminants,
 * drifted versions, out-of-range sizes and a state that contradicts its result.
 */
import { isAssetIntakeError } from './asset-intake.errors';
import { MAX_UPLOAD_BYTES } from './asset-intake.policy';
import {
  decodeAllocation,
  decodeCompleted,
  decodeResultForState,
  UPLOAD_RESULT_SCHEMA_VERSION,
} from './upload-result.codec';

const ASSET_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const CLAIM_TOKEN = '5a5b0a03-9b5a-480b-9a37-4399a8fc4afe';
const CHECKSUM = `sha256:${'a'.repeat(64)}`;
const CONTENT_FP = `sha256:${'b'.repeat(64)}`;

const ALLOCATION = {
  schemaVersion: UPLOAD_RESULT_SCHEMA_VERSION,
  kind: 'ASSET_UPLOAD_ALLOCATION',
  assetId: ASSET_ID,
  bucketAlias: 'ORIGINALS',
  objectKey: `test/originals/${ASSET_ID}/original.png`,
  claimToken: CLAIM_TOKEN,
  requestFingerprintVersion: 1,
};

const COMPLETED = {
  schemaVersion: UPLOAD_RESULT_SCHEMA_VERSION,
  kind: 'ASSET_UPLOAD_COMPLETED',
  assetId: ASSET_ID,
  bucketAlias: 'ORIGINALS',
  objectKey: `test/originals/${ASSET_ID}/original.png`,
  mediaType: 'image/png',
  byteSize: 51_200,
  checksum: CHECKSUM,
  contentFingerprint: CONTENT_FP,
  assetStatus: 'INSPECTING',
  inspectionEventId: '42',
};

function codeOf(work: () => unknown): string {
  try {
    work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

describe('decodeAllocation', () => {
  it('accepts the exact contract shape', () => {
    expect(decodeAllocation(ALLOCATION)).toEqual(ALLOCATION);
  });

  it('round-trips through a JSON copy, as a stored value would', () => {
    expect(decodeAllocation(JSON.parse(JSON.stringify(ALLOCATION)))).toEqual(ALLOCATION);
  });

  it.each([
    ['unknown field', { ...ALLOCATION, extra: true }],
    ['missing claimToken', { ...ALLOCATION, claimToken: undefined }],
    ['wrong kind', { ...ALLOCATION, kind: 'ASSET_UPLOAD_COMPLETED' }],
    ['wrong schemaVersion', { ...ALLOCATION, schemaVersion: 2 }],
    ['non-v7 assetId', { ...ALLOCATION, assetId: '019826f0-1c3d-4a41-9b6e-2f5a8c4d1e07' }],
    ['malformed claimToken', { ...ALLOCATION, claimToken: 'not-a-uuid' }],
    ['foreign bucket', { ...ALLOCATION, bucketAlias: 'DERIVATIVES' }],
    ['empty object key', { ...ALLOCATION, objectKey: '' }],
    ['null', null],
    ['string', 'ASSET_UPLOAD_ALLOCATION'],
    ['array', [ALLOCATION]],
  ])('rejects %s', (_label, stored) => {
    expect(codeOf(() => decodeAllocation(stored))).toBe('IDEMPOTENCY_RESULT_INVALID');
  });

  it('never echoes the stored value in the error', () => {
    try {
      decodeAllocation({ ...ALLOCATION, claimToken: 'leaky-secret-value' });
      throw new Error('expected a rejection');
    } catch (error: unknown) {
      expect((error as Error).message).not.toContain('leaky-secret-value');
    }
  });
});

describe('decodeCompleted', () => {
  it('accepts the exact contract shape', () => {
    expect(decodeCompleted(COMPLETED)).toEqual(COMPLETED);
  });

  it('accepts a byteSize at exactly the approved maximum', () => {
    expect(decodeCompleted({ ...COMPLETED, byteSize: MAX_UPLOAD_BYTES }).byteSize).toBe(
      MAX_UPLOAD_BYTES,
    );
  });

  it.each([
    ['byteSize above the approved maximum', { ...COMPLETED, byteSize: MAX_UPLOAD_BYTES + 1 }],
    ['zero byteSize', { ...COMPLETED, byteSize: 0 }],
    ['fractional byteSize', { ...COMPLETED, byteSize: 1.5 }],
    ['uppercase checksum', { ...COMPLETED, checksum: `sha256:${'A'.repeat(64)}` }],
    ['unprefixed checksum', { ...COMPLETED, checksum: 'a'.repeat(64) }],
    ['short checksum', { ...COMPLETED, checksum: `sha256:${'a'.repeat(63)}` }],
    ['missing contentFingerprint', { ...COMPLETED, contentFingerprint: undefined }],
    ['unsupported mediaType', { ...COMPLETED, mediaType: 'image/gif' }],
    ['non-INSPECTING assetStatus', { ...COMPLETED, assetStatus: 'ACCEPTED' }],
    ['numeric inspectionEventId', { ...COMPLETED, inspectionEventId: 42 }],
    ['zero inspectionEventId', { ...COMPLETED, inspectionEventId: '0' }],
    ['unknown field', { ...COMPLETED, publicUrl: 'https://example.test/x.png' }],
  ])('rejects %s', (_label, stored) => {
    expect(codeOf(() => decodeCompleted(stored))).toBe('IDEMPOTENCY_RESULT_INVALID');
  });

  it('carries the outbox id as a string so a large sequence cannot round', () => {
    const large = '9007199254740993';
    expect(decodeCompleted({ ...COMPLETED, inspectionEventId: large }).inspectionEventId).toBe(
      large,
    );
  });
});

describe('decodeResultForState', () => {
  it('pairs each state with its own variant', () => {
    expect(decodeResultForState('IN_PROGRESS', ALLOCATION)).toEqual(ALLOCATION);
    expect(decodeResultForState('COMPLETED', COMPLETED)).toEqual(COMPLETED);
  });

  it.each([
    ['IN_PROGRESS carrying a completed result', 'IN_PROGRESS' as const, COMPLETED],
    ['COMPLETED carrying an allocation', 'COMPLETED' as const, ALLOCATION],
  ])('rejects %s', (_label, status, stored) => {
    expect(codeOf(() => decodeResultForState(status, stored))).toBe('IDEMPOTENCY_RESULT_INVALID');
  });
});
