/**
 * What a failed design-case operation means, decided from the normalized
 * envelope and never from a message string.
 *
 * Four classifiers, because four surfaces fail differently:
 *
 * - **a bootstrap read** either produced a request context or did not;
 * - **the submitted-source read** has an outcome that is not a failure at all —
 *   `APP6-B07` answers `200` with `submittedDesign: null` for a
 *   customer-owned-product request and for a Catalog request whose session is
 *   gone. That absence never reaches this module, and turning a successful
 *   honest absence into a network error is the specific defect `APP6-A02` §24
 *   names;
 * - **an authoring write** may be refused for the document, for the placement
 *   the operator supplied, or because the request is not in an authoring state;
 * - **a send** may be refused because another version is already in review,
 *   which is the outcome that changes what the screen *does* rather than only
 *   what it says.
 *
 * Nothing in this module reads `normalized.message`, and nothing returns it.
 * Every operation behind this screen is a private Admin endpoint: a server
 * message, SQL fragment, constraint name, request id or provider string has no
 * operator value and is a disclosure.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

/** The only error type this feature's services throw. */
export class RequestDesignCaseApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin design-case API call failed.');
    this.name = 'RequestDesignCaseApiError';
    this.normalized = normalized;
  }
}

export function isRequestDesignCaseApiError(error: unknown): error is RequestDesignCaseApiError {
  return error instanceof RequestDesignCaseApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isRequestDesignCaseApiError(error) ? error.normalized : null;
}

/**
 * Why a read could not be shown.
 *
 * `missing` covers 404, 403 **and** 400 as one outcome, on `APP5-A02`'s
 * reasoning: distinguishing "no such request" from "not yours to read" is
 * exactly what tells an unauthorized caller that an id is real, and a malformed
 * id will keep being refused so a retry cannot help.
 *
 * `unresolvable` is the design-case 409 — the request exists and the operator
 * may read it, but its design thread does not resolve. It is separated from
 * `retryable` because retrying cannot fix it and from `missing` because the
 * request is right there on the screen it was reached from.
 */
export type ReadFailure = 'missing' | 'unresolvable' | 'unauthenticated' | 'retryable';

export function classifyReadFailure(error: unknown): ReadFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
    case HTTP_BAD_REQUEST:
      return 'missing';
    case HTTP_CONFLICT:
      return 'unresolvable';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'retryable';
  }
}

/**
 * Why authoring a new DRAFT was refused.
 *
 * `ineligible` is `TR-LC08-01`: the request is not `DIGITIZING` or
 * `DESIGN_REVIEW`. The screen already gates on that, so reaching it means the
 * world moved under the operator — the answer is to re-read, not to retry.
 *
 * `rejected` covers the document refusal (`DOCUMENT_REJECTED`) and the placement
 * refusal (`PLACEMENT_INPUT_INVALID`) plus the DTO's own 400s. What the operator
 * supplied was judged and found wrong, which is something they can fix in the
 * form — so the entered values stay.
 */
export type AuthoringFailure =
  'ineligible' | 'rejected' | 'unauthenticated' | 'missing' | 'retryable';

export function classifyAuthoringFailure(error: unknown): AuthoringFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      return 'ineligible';
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

/** Whether the operator's entered placement values survive the refusal. */
export function preservesAuthoringFields(failure: AuthoringFailure): boolean {
  return failure === 'rejected' || failure === 'retryable';
}

/**
 * Why a send was refused.
 *
 * `reviewActive` is `APP6-B09`'s `REVIEW_ALREADY_ACTIVE` — another version of
 * this design case is already awaiting a customer decision. It is told apart
 * from the other conflicts by **code**, which is the one place a code is read
 * and never rendered: `APP6-A02` §19 requires its own reconciliation state, and
 * folding it into `stale` would offer the operator the wrong next step.
 *
 * `stale` is every other refusal that could mean the world moved: the version is
 * no longer a sendable DRAFT, the request left its authoring states, or the
 * version vanished. The operator's next step is identical in each — look at what
 * is now true.
 *
 * There is deliberately no outcome that resends, none that supersedes the other
 * review, and none that picks a different version to send instead.
 */
export type SendFailure = 'reviewActive' | 'stale' | 'unauthenticated' | 'retryable';

/** `APP6-B09`'s refusal when another version of this case is already in review. */
const REVIEW_ALREADY_ACTIVE = 'REVIEW_ALREADY_ACTIVE';

export function classifySendFailure(error: unknown): SendFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';
  switch (normalized.httpStatus) {
    case HTTP_CONFLICT:
      return normalized.code === REVIEW_ALREADY_ACTIVE ? 'reviewActive' : 'stale';
    case HTTP_NOT_FOUND:
    case HTTP_FORBIDDEN:
    case HTTP_BAD_REQUEST:
    case HTTP_UNPROCESSABLE:
      return 'stale';
    case HTTP_UNAUTHORIZED:
      return 'unauthenticated';
    default:
      return 'retryable';
  }
}

/**
 * Whether the screen must re-read server truth before offering any action again.
 *
 * True for both refusals that could mean the world moved. The screen re-reads,
 * renders what is now true, and waits — it never auto-selects another version,
 * never supersedes the active review and never resends.
 */
export function requiresReconciliation(failure: SendFailure): boolean {
  return failure === 'reviewActive' || failure === 'stale';
}
