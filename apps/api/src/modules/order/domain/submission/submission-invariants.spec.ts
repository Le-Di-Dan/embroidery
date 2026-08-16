/**
 * The `APP5-B01` rules that need no database (`APP5-G01` §3, §4.2, §5, §6).
 *
 * Everything here is a pure decision the submission transaction depends on, so
 * it is asserted directly rather than inferred from an HTTP response: an
 * integration test that got a 422 could not tell a subject-invariant failure
 * from an asset one, and a fingerprint that quietly stopped being stable would
 * show up as a flaky conflict months later.
 */
import { HttpStatus } from '@nestjs/common';

import { generateRequestCode, REQUEST_CODE_ALPHABET, REQUEST_CODE_PATTERN } from './request-code';
import {
  isRoleAllowedOnBranch,
  APP5_REQUEST_ASSET_ROLES,
  MAX_ASSETS_PER_ROLE,
} from './request-asset-policy';
import {
  submissionFailureResponse,
  SUBMISSION_FAILURES,
  type SubmissionFailure,
} from './request-submission.errors';
import { REQUEST_SUBMIT_NAMESPACE } from './request-submit-idempotency';
import { submissionFingerprint } from './submission-fingerprint';
import { resolveSubmissionSubject, type SubmissionSubject } from './submission-subject';

const CATALOG = {
  productId: 'product-1',
  productVariantId: 'variant-1',
  designSessionId: 'session-1',
};

const COP = { name: 'Áo khoác của tôi', description: 'Bạc màu ở tay áo' };

const catalogSubject = resolveSubmissionSubject({ catalog: CATALOG }) as SubmissionSubject;
const copSubject = resolveSubmissionSubject({ customerOwnedProduct: COP }) as SubmissionSubject;

describe('APP5 submission subject invariant (G01 §3)', () => {
  it('resolves the catalog branch, carrying the required variant', () => {
    expect(catalogSubject).toEqual({
      branch: 'CATALOG',
      productId: 'product-1',
      productVariantId: 'variant-1',
      designSessionId: 'session-1',
    });
  });

  it('resolves the customer-owned branch with no product, variant or session', () => {
    expect(copSubject).toEqual({ branch: 'COP', product: COP });
  });

  it('refuses both branches present', () => {
    expect(
      resolveSubmissionSubject({ catalog: CATALOG, customerOwnedProduct: COP }),
    ).toBeUndefined();
  });

  it('refuses neither branch present', () => {
    expect(resolveSubmissionSubject({})).toBeUndefined();
  });
});

describe('APP5 submission fingerprint (G01-D02)', () => {
  const breakdown = [
    { productVariantId: 'variant-1', sizeLabel: 'M', quantity: 10 },
    { productVariantId: 'variant-1', sizeLabel: 'L', quantity: 5 },
  ];

  it('is stable across repeated computation', () => {
    expect(submissionFingerprint({ subject: catalogSubject, breakdown })).toBe(
      submissionFingerprint({ subject: catalogSubject, breakdown }),
    );
  });

  it('is independent of the order the client stated the quantity lines in', () => {
    expect(
      submissionFingerprint({ subject: catalogSubject, breakdown: [...breakdown].reverse() }),
    ).toBe(submissionFingerprint({ subject: catalogSubject, breakdown }));
  });

  it('changes when a quantity changes', () => {
    const changed: typeof breakdown = [
      breakdown[0] as (typeof breakdown)[number],
      { ...(breakdown[1] as (typeof breakdown)[number]), quantity: 6 },
    ];
    expect(submissionFingerprint({ subject: catalogSubject, breakdown: changed })).not.toBe(
      submissionFingerprint({ subject: catalogSubject, breakdown }),
    );
  });

  it('changes when the subject changes', () => {
    const other = resolveSubmissionSubject({
      catalog: { ...CATALOG, productVariantId: 'variant-2' },
    }) as SubmissionSubject;
    expect(submissionFingerprint({ subject: other, breakdown })).not.toBe(
      submissionFingerprint({ subject: catalogSubject, breakdown }),
    );
  });

  it('separates the two branches even when nothing else differs', () => {
    expect(submissionFingerprint({ subject: copSubject, breakdown: [] })).not.toBe(
      submissionFingerprint({ subject: catalogSubject, breakdown: [] }),
    );
  });

  it('distinguishes an omitted optional from an empty one', () => {
    const omitted = resolveSubmissionSubject({
      customerOwnedProduct: { name: 'Áo' },
    }) as SubmissionSubject;
    const empty = resolveSubmissionSubject({
      customerOwnedProduct: { name: 'Áo', description: '' },
    }) as SubmissionSubject;
    expect(submissionFingerprint({ subject: omitted, breakdown: [] })).not.toBe(
      submissionFingerprint({ subject: empty, breakdown: [] }),
    );
  });

  it('cannot be collided by moving characters between adjacent fields', () => {
    const left = resolveSubmissionSubject({
      catalog: { productId: 'ab', productVariantId: 'c', designSessionId: 's' },
    }) as SubmissionSubject;
    const right = resolveSubmissionSubject({
      catalog: { productId: 'a', productVariantId: 'bc', designSessionId: 's' },
    }) as SubmissionSubject;
    expect(submissionFingerprint({ subject: left, breakdown: [] })).not.toBe(
      submissionFingerprint({ subject: right, breakdown: [] }),
    );
  });

  it('is a sha256 digest in the repository-wide form', () => {
    expect(submissionFingerprint({ subject: catalogSubject, breakdown })).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it('claims the locked namespace', () => {
    expect(REQUEST_SUBMIT_NAMESPACE).toBe('request.submit');
  });
});

describe('APP5 request code (G01-D12)', () => {
  it('is REQ- plus ten characters of the unambiguous alphabet', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateRequestCode()).toMatch(REQUEST_CODE_PATTERN);
    }
  });

  it('excludes every character a customer could misread aloud', () => {
    for (const character of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(REQUEST_CODE_ALPHABET).not.toContain(character);
    }
  });

  it('does not repeat itself — the code is not a sequence', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => generateRequestCode()));
    expect(drawn.size).toBe(200);
  });

  it('discards bytes that would bias the draw rather than folding them in', () => {
    // 250 and above are at or past the rejection ceiling (8 × 30 = 240): a plain
    // `% 30` would map them onto the first symbols and skew the alphabet.
    const scripted = [255, 254, 253, 252, 251, 250, 249, 248, 247, 246];
    let call = 0;
    const code = generateRequestCode((size) => {
      call += 1;
      // First round: every byte is rejected, so the generator must ask again.
      return Buffer.from(call === 1 ? scripted : new Array<number>(size).fill(0));
    });
    expect(call).toBeGreaterThan(1);
    expect(code).toBe(`REQ-${(REQUEST_CODE_ALPHABET[0] as string).repeat(10)}`);
  });
});

describe('APP5 asset-role matrix (G01 §6)', () => {
  it('exposes exactly COP_IMAGE and REFERENCE — never ATTACHMENT', () => {
    expect([...APP5_REQUEST_ASSET_ROLES]).toEqual(['COP_IMAGE', 'REFERENCE']);
    expect(APP5_REQUEST_ASSET_ROLES as readonly string[]).not.toContain('ATTACHMENT');
  });

  it('allows REFERENCE on both branches and COP_IMAGE only on the COP branch', () => {
    expect(isRoleAllowedOnBranch('REFERENCE', 'CATALOG')).toBe(true);
    expect(isRoleAllowedOnBranch('REFERENCE', 'COP')).toBe(true);
    expect(isRoleAllowedOnBranch('COP_IMAGE', 'COP')).toBe(true);
    expect(isRoleAllowedOnBranch('COP_IMAGE', 'CATALOG')).toBe(false);
  });

  it('caps a role at ten per request', () => {
    expect(MAX_ASSETS_PER_ROLE).toBe(10);
  });
});

describe('APP5 submission refusals (G01 §9.3)', () => {
  const statusOf = (failure: SubmissionFailure): number =>
    submissionFailureResponse(failure).getStatus();

  it('publishes the failure as a stable business code, not a class name', () => {
    for (const failure of SUBMISSION_FAILURES) {
      expect(submissionFailureResponse(failure).getResponse()).toMatchObject({ code: failure });
    }
  });

  it('answers 409 for the idempotency outcomes, 401 for a credential, 422 for the rest', () => {
    expect(statusOf('IDEMPOTENCY_CONFLICT')).toBe(HttpStatus.CONFLICT);
    expect(statusOf('DUPLICATE_OPERATION')).toBe(HttpStatus.CONFLICT);
    expect(statusOf('SESSION_NOT_AUTHORIZED')).toBe(HttpStatus.UNAUTHORIZED);
    expect(statusOf('SUBMISSION_SUBJECT_INVALID')).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(statusOf('CUSTOMER_NOT_VERIFIED')).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(statusOf('SESSION_EXPIRED')).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(statusOf('REQUEST_ASSET_NOT_BINDABLE')).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('keeps the session-credential refusal indistinguishable from APP3 own answer', () => {
    // An unknown id, a wrong secret and a dead session must read alike.
    expect(submissionFailureResponse('SESSION_NOT_AUTHORIZED').getResponse()).toMatchObject({
      message: 'That design session could not be authorized.',
    });
  });

  it('names no customer, contact, session, grant or asset in any message', () => {
    for (const failure of SUBMISSION_FAILURES) {
      const body = JSON.stringify(submissionFailureResponse(failure).getResponse());
      for (const leak of ['customer id', 'challenge id', 'session id', 'token', 'storage']) {
        expect(body.toLowerCase()).not.toContain(leak);
      }
    }
  });
});
