/**
 * What a failed quotation operation means, decided from the normalized envelope
 * and never from a message string.
 *
 * Three classifiers, because three surfaces fail differently:
 *
 * - **a bootstrap read** either produced a request context or did not;
 * - **a drafting write** may be refused for what the operator priced, or because
 *   a quotation already exists;
 * - **a send** may be refused because the version or the request is no longer
 *   sendable, which is the outcome that changes what the screen *does* rather
 *   than only what it says.
 *
 * Nothing in this module reads `normalized.message`, and nothing returns it.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** The only error type this feature's services throw. */
export class RequestQuotationApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin quotation API call failed.');
    this.name = 'RequestQuotationApiError';
    this.normalized = normalized;
  }
}

export function isRequestQuotationApiError(error: unknown): error is RequestQuotationApiError {
  return error instanceof RequestQuotationApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isRequestQuotationApiError(error) ? error.normalized : null;
}

/**
 * Why a read could not be shown.
 *
 * `missing` covers 404, 403 **and** 400 as one outcome, on `APP5-A02`'s
 * reasoning: distinguishing "no such request" from "not yours to read" is
 * exactly what tells an unauthorized caller that an id is real, and a malformed
 * id will keep being refused so a retry cannot help.
 */
export type ReadFailure = 'missing' | 'unauthenticated' | 'retryable';

export function classifyReadFailure(error: unknown): ReadFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
    case HTTP_BAD_REQUEST:
      return 'missing';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'retryable';
  }
}

/**
 * Why a drafting write was refused.
 *
 * `exists` is `APP6-B01`'s `QUOTATION_ALREADY_EXISTS` — another tab or another
 * operator created the quotation first. It is the one refusal the screen
 * *recovers* from rather than merely reports, and it recovers by re-reading the
 * request detail for the durable locator. The id is never parsed out of the
 * error: a code is not an address, and a screen that learned to read one would
 * keep working right up until the message changed.
 *
 * `rejected` is the pricing refusal (`QUOTATION_PRICING_INVALID`) and the DTO's
 * own 400s. The operator's figures were judged and found wrong, which is
 * something they can fix in the form — so the entered values stay.
 */
export type DraftingFailure =
  'exists' | 'rejected' | 'stale' | 'unauthenticated' | 'missing' | 'retryable';

export function classifyDraftingFailure(error: unknown): DraftingFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      // Both of B01's conflicts land here. `QUOTATION_ALREADY_EXISTS` is
      // recoverable by re-reading the locator; a request that is no longer
      // quotable is not. They are told apart by code — the one place a code is
      // read, and never rendered.
      return normalized.code === 'QUOTATION_ALREADY_EXISTS' ? 'exists' : 'stale';
    case HTTP_BAD_REQUEST:
    case HTTP_UNPROCESSABLE:
      return 'rejected';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
      return 'missing';
    default:
      return 'retryable';
  }
}

/** Whether the operator's typed figures survive the refusal. */
export function preservesDraftFields(failure: DraftingFailure): boolean {
  return failure === 'rejected' || failure === 'retryable';
}

/**
 * Why a send was refused.
 *
 * `stale` is the outcome that changes behaviour: the version or the request is
 * not in the state the operator decided against, so the screen re-reads and
 * requires a **new** explicit decision. `QUOTATION_VERSION_NOT_SENDABLE`,
 * `REQUEST_NOT_SENDABLE` and a vanished version all land there, because the
 * operator's next step is identical in each — look at what is now true.
 *
 * There is deliberately no outcome that resends, and none that picks a different
 * version to send instead.
 */
export type SendFailure = 'stale' | 'unauthenticated' | 'unavailable' | 'retryable';

export function classifySendFailure(error: unknown): SendFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
    case HTTP_BAD_REQUEST:
      return 'stale';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    // `QUOTATION_POLICY_UNAVAILABLE`: the deposit or validity policy is not
    // published. Nothing the operator typed is wrong and nothing was sent, so it
    // is reported as a dependency failure rather than as their mistake.
    case HTTP_SERVICE_UNAVAILABLE:
      return 'unavailable';
    default:
      return 'retryable';
  }
}

/**
 * Whether the screen must re-read server truth before offering any action again.
 *
 * True for every send refusal that could mean the world moved. The screen
 * re-reads, renders what is now true, and waits — it never auto-selects another
 * version and never resends.
 */
export function requiresReconciliation(failure: SendFailure): boolean {
  return failure === 'stale';
}
