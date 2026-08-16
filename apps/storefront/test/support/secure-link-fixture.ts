/**
 * Fixtures for the `/truy-cap` secure-link landing suites (`APP4-S02`
 * machinery, `APP5-S02` consumer).
 *
 * Every value is synthetic. The token used throughout is a fixed test string
 * that exists only here and in the assertions proving it is *absent* from
 * caches, storage, the URL, history state, the DOM and the console. It is
 * deliberately kept out of the completion report.
 */
import type { ApiSuccessResponse } from '@embroidery/api-client';
import { AxiosError, AxiosHeaders } from 'axios';

export function envelopeOf<T>(data: T): ApiSuccessResponse & { data: T } {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'req-test', timestamp: '2026-08-15T09:00:00.000Z' },
  };
}

/**
 * A syntactically valid token: 43 base64url characters, matching the pattern
 * `ResolveSecureLinkBody.token` publishes. It is never a real credential.
 */
export const TEST_TOKEN = 'S02TestTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** 42 characters — one short, so it must be refused without a request. */
export const SHORT_TOKEN = TEST_TOKEN.slice(0, 42);

/** Right length, wrong alphabet: `+` and `/` are base64, not base64url. */
export const OUT_OF_ALPHABET_TOKEN = `${TEST_TOKEN.slice(0, 41)}+/`;

/**
 * An Axios error carrying a real API error envelope, which is what
 * `normalizeApiClientError` reads. The six backend causes are indistinguishable
 * here by construction: they all produce this one shape.
 */
export function apiFailure(status: number, code: string, message = 'refused'): AxiosError {
  const error = new AxiosError(message, 'ERR_BAD_REQUEST');
  error.response = {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      code,
      message,
      meta: { requestId: 'req-test', timestamp: '2026-08-15T09:00:00.000Z' },
    },
  };
  return error;
}

/** A transport failure with no response at all — no verdict was ever reached. */
export function networkFailure(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK');
}

/**
 * Points the jsdom window at `/truy-cap` with the given fragment.
 *
 * jsdom refuses a cross-origin `history.replaceState`, so the pathname is set
 * through a same-origin replace first; the fragment is then appended exactly as
 * a real secure link would deliver it.
 */
export function navigateToLanding(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap${fragment}`);
}
