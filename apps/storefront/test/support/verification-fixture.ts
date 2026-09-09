/**
 * Fixtures for the `APP4-S01` contact-verification suites.
 *
 * Every value is synthetic. The code used throughout is a fixed test string that
 * exists only here and in the assertions that prove it is *absent* from caches,
 * storage, the URL and the console.
 */
import type {
  ApiSuccessResponse,
  VerificationChallengeResponse,
  VerificationChallengeStatusResponse,
} from '@embroidery/api-client';

export function envelopeOf<T>(data: T): ApiSuccessResponse & { data: T } {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'req-test', timestamp: '2026-08-15T09:00:00.000Z' },
  };
}

/** A fixed instant so every expiry and cooldown in a test is exact. */
export const NOW_ISO = '2026-08-15T09:00:00.000Z';
export const NOW_MS = Date.parse(NOW_ISO);

/** The policy durations, as the *server* would return them. Never read by src. */
const TTL_MS = 600_000;
const COOLDOWN_MS = 60_000;

export const CHALLENGE_ID = 'challenge-0001';
export const REPLACEMENT_CHALLENGE_ID = 'challenge-0002';

/** What `APP4-P01` would produce for the synthetic contacts below. */
export const MASKED_EMAIL = 'b***@vidu.com';

export const TEST_EMAIL = 'ban@vidu.com';

/**
 * A phone number, kept only so a test can prove the verification flow offers no
 * way to send one (`APP12-N01.S01` §19). It is never a verification target.
 */
export const TEST_PHONE = '0912345678';

/**
 * A code with a leading zero, which is the whole reason the contract types it as
 * a string. Kept out of the completion report on purpose.
 */
export const TEST_CODE = '012345';

export function makeChallenge(
  overrides: Partial<VerificationChallengeResponse> = {},
): VerificationChallengeResponse {
  return {
    challengeId: CHALLENGE_ID,
    expiresAt: new Date(NOW_MS + TTL_MS).toISOString(),
    resendAvailableAt: new Date(NOW_MS + COOLDOWN_MS).toISOString(),
    recipientMasked: MASKED_EMAIL,
    ...overrides,
  };
}

export function makeStatus(
  state: VerificationChallengeStatusResponse['state'],
): VerificationChallengeStatusResponse {
  return {
    challengeId: CHALLENGE_ID,
    expiresAt: new Date(NOW_MS + TTL_MS).toISOString(),
    state,
  };
}

/** An Axios-shaped rejection carrying only a status, the way the API answers. */
export function apiFailure(status: number): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: { status, data: {} },
    toJSON: () => ({}),
  };
}

/**
 * A refusal that carries a business code in the envelope, the way the platform
 * error mapper publishes one when a feature attaches it.
 *
 * `apiFailure` sends `data: {}`, which normalizes to a status-only error — that
 * is what most of APP4's refusals actually look like on the wire. This builds
 * the other shape, for the one classification that is decided by code rather
 * than by status.
 */
export function apiCodedFailure(status: number, code: string): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: {
      status,
      data: {
        success: false,
        code,
        message: 'Refused.',
        meta: { requestId: 'req-test', timestamp: NOW_ISO },
      },
    },
    toJSON: () => ({}),
  };
}

/** A transport failure with no response at all — the recoverable-error path. */
export function networkFailure(): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    code: 'ECONNRESET',
    message: 'Network Error',
    toJSON: () => ({}),
  };
}
