/**
 * The few failures the Studio bootstrap behaves differently about
 * (`APP3-S01`).
 *
 * Branching is on **HTTP status only**. `APP3-B05`, `APP3-B05A` and `APP3-B07`
 * all collapse every invisible state into one non-disclosing 404 whose message
 * is a fixed sentence, and a client that read that sentence would be reading the
 * one field the server explicitly refuses to make meaningful. So no code path
 * here inspects `message`, and the `code` is carried only so a failure can be
 * reported, never so it can be interpreted.
 */
import { normalizeApiClientError, type NormalizedApiError } from '@embroidery/api-client';

export class StudioApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('A Studio bootstrap API call failed.');
    this.name = 'StudioApiError';
    this.normalized = normalized;
  }
}

export function isStudioApiError(error: unknown): error is StudioApiError {
  return error instanceof StudioApiError;
}

/** Wraps any transport failure so no raw Axios error crosses into the feature. */
export function toStudioApiError(error: unknown): StudioApiError {
  return new StudioApiError(normalizeApiClientError(error));
}

function statusOf(error: unknown): number | undefined {
  return isStudioApiError(error) ? error.normalized.httpStatus : undefined;
}

const HTTP_NOT_FOUND = 404;

/**
 * What a failed read means to the visitor.
 *
 * - `gone` — the server answered its safe 404. The thing asked for is not
 *   available to an anonymous caller, and it will not become available by
 *   asking again, so nothing retries and the screen offers a reselection.
 * - `retryable` — a 503, a timeout or an unreachable API. The request may
 *   genuinely succeed later, so the visitor is offered an explicit retry.
 *
 * Only 404 is `gone`. A 500 that happens to arrive while a Template is being
 * unpublished must not be reported as "this Template no longer exists": that
 * would tell the visitor something the server never said.
 */
export type StudioFailure = 'gone' | 'retryable';

export function classifyStudioFailure(error: unknown): StudioFailure {
  return statusOf(error) === HTTP_NOT_FOUND ? 'gone' : 'retryable';
}
