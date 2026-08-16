/**
 * The APP5 intake contract, as unit facts (`APP5-B02` §13.1).
 *
 * Three things a database cannot check and a reviewer should not have to take
 * on trust: which roles the surface exposes, what a refusal is allowed to say,
 * and what the success response carries. All three are leak tests rather than
 * shape tests — the risk is an extra value, not a missing one.
 *
 * The media decoder, the signature allowlist and the multipart parser are
 * `APP2-B01`'s and have their own mature suites; nothing here re-tests them.
 */
import { HttpException } from '@nestjs/common';

import { toRequestIntakeView } from '../../application/intake/request-intake-projection';
import {
  isRequestIntakeError,
  REQUEST_INTAKE_ERROR_CODES,
  requestIntakeError,
  toHttpException,
} from './request-intake.errors';
import { parseRequestIntakeRole } from '../../presentation/schemas/request-asset-intake.request';
import {
  isRequestIntakeRole,
  MAX_ACCEPTED_UPLOADS_PER_CHALLENGE,
  REQUEST_INTAKE_ASSET_KIND,
  REQUEST_INTAKE_CLASSIFICATION,
  REQUEST_INTAKE_LANE,
  REQUEST_INTAKE_ROLES,
} from './request-intake.policy';
import { buildRequestIntakeFingerprint } from './request-intake-fingerprint';
import { decodeRequestIntakeCompleted } from './request-intake-result.codec';

/**
 * The bounded code a role refusal raises.
 *
 * Read through the type guard rather than through `expect.objectContaining`,
 * which types its argument as `any` and so would let a refusal carrying no code
 * at all pass this suite.
 */
function roleRefusalCode(raw: unknown): string {
  try {
    parseRequestIntakeRole(raw);
  } catch (error: unknown) {
    return isRequestIntakeError(error) ? error.code : 'not-an-intake-error';
  }
  return 'not-refused';
}

describe('APP5 intake role allowlist', () => {
  it('exposes exactly COP_IMAGE and REFERENCE', () => {
    expect([...REQUEST_INTAKE_ROLES]).toEqual(['COP_IMAGE', 'REFERENCE']);
  });

  it('rejects ATTACHMENT', () => {
    // `REQUEST_ASSET_ROLES` has three members and `G01-D14` exposes two. A role
    // APP5 has no surface for would create rows no checkpoint can moderate.
    expect(isRequestIntakeRole('ATTACHMENT')).toBe(false);
    expect(roleRefusalCode('ATTACHMENT')).toBe('REQUEST_INTAKE_ROLE_INVALID');
  });

  it.each([
    ['a lowercase spelling', 'reference'],
    ['a repeated parameter', ['COP_IMAGE', 'REFERENCE']],
    ['an absent parameter', undefined],
    ['an empty string', ''],
    ['a non-string', 7],
  ])('rejects %s', (_label, raw) => {
    // A repeated query parameter arrives as an array; refusing beats "first
    // wins", which would store evidence under a meaning nobody chose.
    expect(roleRefusalCode(raw)).toBe('REQUEST_INTAKE_ROLE_INVALID');
  });

  it('accepts each exposed role verbatim', () => {
    for (const role of REQUEST_INTAKE_ROLES) {
      expect(parseRequestIntakeRole(role)).toBe(role);
    }
  });
});

describe('APP5 intake lane', () => {
  it('fixes the private customer-upload classification', () => {
    expect(REQUEST_INTAKE_ASSET_KIND).toBe('CUSTOMER_UPLOAD');
    expect(REQUEST_INTAKE_CLASSIFICATION).toBe('CUSTOMER_PRIVATE');
    expect(REQUEST_INTAKE_LANE.assetKind).toBe(REQUEST_INTAKE_ASSET_KIND);
    expect(REQUEST_INTAKE_LANE.classification).toBe(REQUEST_INTAKE_CLASSIFICATION);
  });

  it('declares no metadata fields, so the body is one file part', () => {
    // A field whose only legal value is a constant is a field whose only
    // possible effect is to be filled in wrong.
    expect(REQUEST_INTAKE_LANE.declaresMetadataFields).toBe(false);
  });

  it('carries the locked 10 MiB ceiling and the G01-D13 bound', () => {
    expect(REQUEST_INTAKE_LANE.maxUploadBytes).toBe(10_485_760);
    expect(MAX_ACCEPTED_UPLOADS_PER_CHALLENGE).toBe(20);
  });
});

describe('APP5 intake fingerprint', () => {
  const base = {
    scopeKey: 'a'.repeat(64),
    declaredMediaType: 'image/png',
    normalizedFilename: 'photo.png',
  } as const;

  it('separates the two roles', () => {
    // The same file as evidence of the garment means something different from
    // the same file as a reference, so one key must not cover both.
    expect(buildRequestIntakeFingerprint({ ...base, role: 'COP_IMAGE' })).not.toBe(
      buildRequestIntakeFingerprint({ ...base, role: 'REFERENCE' }),
    );
  });

  it('is stable for identical inputs', () => {
    expect(buildRequestIntakeFingerprint({ ...base, role: 'REFERENCE' })).toBe(
      buildRequestIntakeFingerprint({ ...base, role: 'REFERENCE' }),
    );
  });
});

describe('APP5 intake public errors', () => {
  it('answers every authorization miss with one code', () => {
    // Five causes — unknown, wrong purpose, unverified, expired, already
    // submitted — reach the caller as one answer. A finer vocabulary would
    // confirm that a guessed challenge id exists.
    expect(REQUEST_INTAKE_ERROR_CODES).toContain('REQUEST_INTAKE_NOT_AUTHORIZED');
  });

  it('maps each code to an HTTP exception carrying only the code and message', () => {
    for (const code of REQUEST_INTAKE_ERROR_CODES) {
      const exception = toHttpException(requestIntakeError(code));
      expect(exception).toBeInstanceOf(HttpException);
      const body = exception.getResponse() as { code: string; message: string };
      expect(Object.keys(body).sort()).toEqual(['code', 'message']);
      expect(body.code).toBe(code);
      expect(typeof body.message).toBe('string');
    }
  });

  it('names no scanner, signature, key, table or constraint in any message', () => {
    const forbidden = [
      /scan/i,
      /signature/i,
      /magic/i,
      /mime/i,
      /bucket/i,
      /storage/i,
      /s3/i,
      /object key/i,
      /sql/i,
      /constraint/i,
      /ck_/i,
      /uq_/i,
      /assets\b/i,
      /challenge id/i,
      /customer id/i,
    ];
    for (const code of REQUEST_INTAKE_ERROR_CODES) {
      const message = requestIntakeError(code).message;
      for (const pattern of forbidden) {
        expect(message).not.toMatch(pattern);
      }
    }
  });

  it('does not disclose whether a challenge exists', () => {
    // The message must read the same whether the id was never issued or was
    // spent an hour ago.
    const message = requestIntakeError('REQUEST_INTAKE_NOT_AUTHORIZED').message;
    expect(message).not.toMatch(/not found|unknown|expired|already/i);
  });
});

describe('APP5 intake response projection', () => {
  const completed = decodeRequestIntakeCompleted({
    schemaVersion: 1,
    kind: 'CUSTOM_REQUEST_INTAKE_COMPLETED',
    assetId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07',
    role: 'COP_IMAGE',
    bucketAlias: 'ORIGINALS',
    objectKey: 'dev/originals/019826f0/original.png',
    mediaType: 'image/png',
    byteSize: 51_200,
    checksum: `sha256:${'a'.repeat(64)}`,
    contentFingerprint: 'b'.repeat(64),
    inspectionEventId: '42',
  });

  it('publishes exactly five fields', () => {
    expect(Object.keys(toRequestIntakeView(completed)).sort()).toEqual([
      'assetId',
      'byteSize',
      'mediaType',
      'role',
      'state',
    ]);
  });

  it('publishes no storage identity, checksum, fingerprint or event id', () => {
    // The stored record carries all four because a replay needs them. The
    // response is where they must stop.
    const serialized = JSON.stringify(toRequestIntakeView(completed));
    expect(serialized).not.toContain('ORIGINALS');
    expect(serialized).not.toContain('original.png');
    expect(serialized).not.toContain(completed.checksum);
    expect(serialized).not.toContain(completed.contentFingerprint);
    expect(serialized).not.toContain(completed.inspectionEventId);
  });

  it('reports INSPECTING, because that is what Tx B just committed', () => {
    expect(toRequestIntakeView(completed).state).toBe('INSPECTING');
  });
});
