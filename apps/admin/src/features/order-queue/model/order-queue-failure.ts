/**
 * The only error type the queue service throws, and how it is read.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. Every operator-facing string is chosen from the copy catalog by the
 * classification alone — the server `message`, `code` and `requestId` are
 * deliberately never read for display.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

export class OrderQueueApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin order queue API call failed.');
    this.name = 'OrderQueueApiError';
    this.normalized = normalized;
  }
}

export function isOrderQueueApiError(error: unknown): error is OrderQueueApiError {
  return error instanceof OrderQueueApiError;
}

const HTTP_BAD_REQUEST = 400;

/**
 * Whether a failed page fetch was the cursor's fault.
 *
 * `APP7-B02` answers `400` for a malformed or unparseable cursor. The advice
 * differs from a transport failure: retrying the *same* cursor can never
 * succeed, so the operator is offered a reload from the first page instead —
 * stated as such, rather than the list silently restarting behind their back.
 */
export function isOrderCursorRejected(error: unknown): boolean {
  return isOrderQueueApiError(error) && error.normalized.httpStatus === HTTP_BAD_REQUEST;
}
