/**
 * The only error type the queue service throws, and how it is read.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. Every operator-facing string is chosen by the classification alone —
 * the server `message` and `requestId` are never read for display, and the
 * business `code` is read as a *structured* field, never parsed out of prose.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

/** The published code a rejected page cursor travels under (`APP8-B03`). */
export const PRODUCTION_CURSOR_INVALID = 'PRODUCTION_CURSOR_INVALID';

export class ProductionQueueApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin production queue API call failed.');
    this.name = 'ProductionQueueApiError';
    this.normalized = normalized;
  }
}

export function isProductionQueueApiError(error: unknown): error is ProductionQueueApiError {
  return error instanceof ProductionQueueApiError;
}

/**
 * Why the queue could not be read.
 *
 * The approved error frame (`782:206`) draws exactly these three, and each has
 * a different honest recovery:
 *
 * - **cursorRejected** — `400` + `PRODUCTION_CURSOR_INVALID`. The server will
 *   not accept that cursor however many times it is offered, so the only
 *   action that can succeed is reading again from the first page. Branching on
 *   the code as well as the status keeps a body-shaped `400` — which this
 *   screen cannot produce, because it validates `orderId` against the accepted
 *   schema before sending — out of the cursor wording.
 * - **unauthenticated** — `401`. Nothing but signing in again will help, so no
 *   retry is offered: none could succeed.
 * - **retryable** — everything else, including every `5xx`. The platform
 *   replaces a `5xx` code and message with a generic pair, so this is the one
 *   band where a second attempt can genuinely differ.
 *
 * A read is idempotent, so there is no "ambiguous" band here: a dropped
 * connection on a `GET` changed nothing, and retrying it is safe.
 */
export type ProductionQueueFailure = 'cursorRejected' | 'unauthenticated' | 'retryable';

export function classifyProductionQueueFailure(error: unknown): ProductionQueueFailure {
  if (!isProductionQueueApiError(error)) return 'retryable';
  const { httpStatus, code } = error.normalized;
  if (httpStatus === HTTP_BAD_REQUEST && code === PRODUCTION_CURSOR_INVALID) {
    return 'cursorRejected';
  }
  if (httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  return 'retryable';
}
