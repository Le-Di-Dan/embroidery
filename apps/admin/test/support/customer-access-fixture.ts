/**
 * Fixtures for the `APP4-A01` customer-access support suites.
 *
 * Every contact value here is **already masked**, because that is the only form
 * the API publishes and therefore the only form the screen can ever receive. The
 * suites additionally search rendered output for values that must never appear —
 * a raw address, a code, a token, a digest — and those are declared here too, as
 * obviously synthetic markers whose whole purpose is to be searched *for*.
 *
 * Test-only.
 */
import type {
  AdminCustomerDetailResponse,
  AdminCustomerGrantsResponse,
  AdminNotificationIntentListResponse,
  AdminNotificationIntentResponse,
  AdminSecureGrantResponse,
  NotificationReplayResponse,
} from '@embroidery/api-client';

export const CUSTOMER_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
export const GRANT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
export const INTENT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6090';
export const REPLAY_INTENT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6091';

/** The masked forms the API publishes. */
export const EMAIL_MASK = 'b***@vidu.test';
export const PHONE_MASK = '+84 ***** 4821';

/**
 * Values that must appear nowhere in the DOM, storage, the URL or a console
 * line. None is real; each exists to be searched for.
 */
export const FORBIDDEN = {
  rawEmail: 'bay.nguyen@vidu.test',
  rawPhone: '+84912345678',
  code: '424242',
  token: 'a01-fixture-token'.padEnd(43, 'x'),
  digest: 'fixture-digest-marker-a01',
  ciphertext: 'fixture-ciphertext-marker-a01',
  providerBody: 'SMTP 550 mailbox unavailable for bay.nguyen',
} as const;

export function makeCustomer(
  overrides: Partial<AdminCustomerDetailResponse> = {},
): AdminCustomerDetailResponse {
  return {
    customerId: CUSTOMER_ID,
    displayName: 'Nguyễn Minh An',
    verifiedAt: '2026-08-12T09:00:00.000Z',
    contacts: [
      { kind: 'EMAIL', maskedValue: EMAIL_MASK, verified: true, primary: true },
      { kind: 'PHONE', maskedValue: PHONE_MASK, verified: false, primary: false },
    ],
    ...overrides,
  };
}

export function makeGrant(
  overrides: Partial<AdminSecureGrantResponse> = {},
): AdminSecureGrantResponse {
  return {
    grantId: GRANT_ID,
    customRequestId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099',
    scopeKind: 'REQUEST_ACCESS',
    status: 'ACTIVE',
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeGrants(
  grants: readonly AdminSecureGrantResponse[] = [makeGrant()],
): AdminCustomerGrantsResponse {
  return { grants: [...grants] };
}

export function makeIntent(
  overrides: Partial<AdminNotificationIntentResponse> = {},
): AdminNotificationIntentResponse {
  return {
    intentId: INTENT_ID,
    status: 'FAILED',
    channel: 'EMAIL',
    recipientMasked: EMAIL_MASK,
    templateKey: 'secure-link.request-access',
    templateVersion: 1,
    createdAt: '2026-08-15T09:00:00.000Z',
    attempts: [
      {
        attemptedAt: '2026-08-15T09:12:04.000Z',
        channel: 'EMAIL',
        outcome: 'FAILED_RETRYABLE',
        errorClass: 'CHANNEL_TIMEOUT',
      },
      {
        attemptedAt: '2026-08-15T09:18:04.000Z',
        channel: 'EMAIL',
        outcome: 'FAILED_TERMINAL',
        errorClass: 'CHANNEL_UNAVAILABLE',
      },
    ],
    ...overrides,
  };
}

export function makeNotifications(
  intents: readonly AdminNotificationIntentResponse[] = [makeIntent()],
): AdminNotificationIntentListResponse {
  return { intents: [...intents] };
}

export function makeReplay(outcome: 'CREATED' | 'EXISTING'): NotificationReplayResponse {
  return { replayIntentId: REPLAY_INTENT_ID, status: 'PENDING', outcome };
}

/** The success envelope the generated client resolves with. */
export function envelope(data: unknown, code = 'OK') {
  return {
    success: true,
    code,
    message: 'ok',
    data,
    meta: { requestId: 'req-a01', timestamp: '2026-08-15T09:00:00.000Z' },
  } as never;
}
