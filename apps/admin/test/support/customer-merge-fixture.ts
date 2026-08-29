/**
 * Fixtures for the `APP10-A02` merge-workflow suites.
 *
 * Every contact value here is **already masked**, because that is the only form
 * either merge response publishes and therefore the only form the screens can
 * receive. The suites additionally search rendered output for values that must
 * never appear — a raw address, a token, a digest — and those live in the
 * `APP4-A01` fixture, which this one re-exports rather than duplicating: one
 * list of forbidden markers is the point of having one.
 *
 * Test-only.
 */
import type {
  AdminCustomerMergeCaseResponse,
  MergeConsequencePreviewResponse,
  MergeParticipantResponse,
} from '@embroidery/api-client';

export const MERGE_CASE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70c1';
export const SURVIVOR_CUSTOMER_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70a1';
export const LOSER_CUSTOMER_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70b2';
export const REQUESTED_BY_ADMIN_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70d3';

export const SURVIVOR_MASK = 's***@vidu.test';
export const LOSER_MASK = 'l***@vidu.test';
export const LOSER_PHONE_MASK = '+84 ***** 7731';

export function makeSurvivor(
  overrides: Partial<MergeParticipantResponse> = {},
): MergeParticipantResponse {
  return {
    customerId: SURVIVOR_CUSTOMER_ID,
    displayName: 'Nguyễn Minh An',
    verifiedAt: '2026-05-02T09:00:00.000Z',
    contacts: [{ kind: 'EMAIL', maskedValue: SURVIVOR_MASK, verified: true, primary: true }],
    ...overrides,
  };
}

export function makeLoser(
  overrides: Partial<MergeParticipantResponse> = {},
): MergeParticipantResponse {
  return {
    customerId: LOSER_CUSTOMER_ID,
    displayName: 'Nguyen Minh An',
    verifiedAt: '2026-07-19T09:00:00.000Z',
    contacts: [
      { kind: 'EMAIL', maskedValue: LOSER_MASK, verified: true, primary: true },
      { kind: 'PHONE', maskedValue: LOSER_PHONE_MASK, verified: false, primary: false },
    ],
    ...overrides,
  };
}

export function makePreview(
  overrides: Partial<MergeConsequencePreviewResponse> = {},
): MergeConsequencePreviewResponse {
  return {
    contactPoints: 3,
    activeSecureAccessGrants: 1,
    customRequests: 4,
    orders: 2,
    uploadedAssets: 7,
    businessProfile: { loserHasProfile: false, survivorHasProfile: true, conflict: false },
    ...overrides,
  };
}

export function makeMergeCase(
  overrides: Partial<AdminCustomerMergeCaseResponse> = {},
): AdminCustomerMergeCaseResponse {
  return {
    mergeCaseId: MERGE_CASE_ID,
    status: 'REQUESTED',
    reason: 'Khách gọi điện xác nhận hai hồ sơ là cùng một người.',
    requestedByAdminId: REQUESTED_BY_ADMIN_ID,
    requestedAt: '2026-08-29T02:00:00.000Z',
    survivor: makeSurvivor(),
    loser: makeLoser(),
    consequencePreview: makePreview(),
    ...overrides,
  };
}

/** The case as it reads once both sides hold a business profile. */
export function makeBlockedCase(): AdminCustomerMergeCaseResponse {
  return makeMergeCase({
    consequencePreview: makePreview({
      businessProfile: { loserHasProfile: true, survivorHasProfile: true, conflict: true },
    }),
  });
}
