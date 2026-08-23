/**
 * What a refused deposit call means for the customer (`APP7-S01` §21, §29).
 *
 * `APP7-B03` and `APP7-B05` publish **closed** vocabularies and this file is
 * their whole client-side reading. Nothing here looks at a server `message`:
 * these routes are reachable by anyone holding a link, the messages are English
 * operator prose the customer never sees, and branching on prose is one copy
 * edit away from a screen that claims the wrong thing.
 *
 * The mapping is by **code first, status second**, in that order, because the
 * codes are the contract and the statuses are shared by refusals that mean
 * different things — three of the deposit conflicts are `409`.
 *
 * ### The one that is a remedy rather than a refusal
 *
 * `REVERIFICATION_REQUIRED` (403) says only that GRD-003 wants a fresh
 * `STEP_UP`; the caller has already proved it holds a live grant for this
 * order. Folding it into "unavailable" would tell a customer whose link works
 * that their link does not, and would remove the one action that resolves it.
 *
 * ### Why a 404 is `UNAVAILABLE` and nothing more
 *
 * Every reason a caller could not be bound to a deposit — unknown, expired,
 * revoked, superseded or wrong-scope token, a request with no order, an order
 * with no live `DEPOSIT` obligation, a foreign or fictional `attemptId` — leaves
 * both surfaces as one identical `404 SECURE_LINK_UNAVAILABLE`. That collapse is
 * the non-enumeration property `APP4-B06` established, and this classification
 * and `secureLinkOutcomeOf` must never disagree about it: the screen renders the
 * same indistinguishable unavailable card and destroys the credential.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

/** The customer-meaningful outcomes of a refused initiation. */
export type InitiateFailure =
  | 'REVERIFICATION_REQUIRED'
  | 'DEPOSIT_NOT_PAYABLE'
  | 'DUPLICATE_OPERATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DEPOSIT_INSTRUCTIONS_UNAVAILABLE'
  | 'UNAVAILABLE'
  | 'TRANSIENT';

const INITIATE_BY_CODE: Readonly<Record<string, InitiateFailure>> = {
  REVERIFICATION_REQUIRED: 'REVERIFICATION_REQUIRED',
  DEPOSIT_NOT_PAYABLE: 'DEPOSIT_NOT_PAYABLE',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  DEPOSIT_INSTRUCTIONS_UNAVAILABLE: 'DEPOSIT_INSTRUCTIONS_UNAVAILABLE',
  SECURE_LINK_UNAVAILABLE: 'UNAVAILABLE',
};

/**
 * The refusals that become a notice over a screen that still has something to
 * show.
 *
 * The other two never reach a banner: an ended session is replaced by the
 * indistinguishable unavailable card, and a missing step-up opens the dialog
 * that resolves it. Naming the remainder as a type is what makes routing either
 * of them into copy a compile error rather than a review comment.
 */
export type NoticeableInitiateFailure = Exclude<
  InitiateFailure,
  'REVERIFICATION_REQUIRED' | 'UNAVAILABLE'
>;

export function initiateFailureOf(error: NormalizedApiError): InitiateFailure {
  const byCode = INITIATE_BY_CODE[error.code];
  if (byCode !== undefined) return byCode;
  return genericOutcome(error);
}

/**
 * Whether this failure ends the secure session outright.
 *
 * Exactly one does, and it is the one meaning the grant itself is gone. A type
 * predicate rather than a plain boolean: the caller's remaining failures are the
 * ones that become a notice over a screen that still has something to show, and
 * narrowing here makes it a compile error to route an ended session into one.
 */
export function endsSecureSession(
  failure: InitiateFailure | UploadFailure,
): failure is 'UNAVAILABLE' {
  return failure === 'UNAVAILABLE';
}

/** The customer-meaningful outcomes of a refused evidence upload. */
export type UploadFailure =
  | 'MEDIA_UNSUPPORTED'
  | 'TOO_LARGE'
  | 'QUOTA_REACHED'
  | 'ATTEMPT_CLOSED'
  | 'REVERIFICATION_REQUIRED'
  | 'IN_PROGRESS'
  | 'UNAVAILABLE'
  | 'TRANSIENT';

/**
 * The upload's vocabulary is three modules wide, and deliberately narrow.
 *
 * `APP7-B05` owns only `EVIDENCE_QUOTA_REACHED` and `EVIDENCE_ATTEMPT_CLOSED`.
 * The media refusals are `APP2-B01`'s `AssetIntakeError`, already bounded to the
 * three classes a customer is allowed to learn, and they are *mapped* here
 * rather than re-coded — a second vocabulary for the same failures is two
 * vocabularies that drift. `REVERIFICATION_REQUIRED` is `APP7-B03`'s, reused for
 * the same rule.
 *
 * Everything the list does not name — a malformed multipart, a stale claim, a
 * storage outage — becomes `TRANSIENT`, which offers a retry and says nothing
 * about the payment. That is the right default: none of them is a statement
 * about the customer's money, and all of them may succeed on a second try.
 */
const UPLOAD_BY_CODE: Readonly<Record<string, UploadFailure>> = {
  ASSET_UPLOAD_MEDIA_UNSUPPORTED: 'MEDIA_UNSUPPORTED',
  ASSET_UPLOAD_SIGNATURE_MISMATCH: 'MEDIA_UNSUPPORTED',
  ASSET_UPLOAD_TOO_LARGE: 'TOO_LARGE',
  EVIDENCE_QUOTA_REACHED: 'QUOTA_REACHED',
  EVIDENCE_ATTEMPT_CLOSED: 'ATTEMPT_CLOSED',
  REVERIFICATION_REQUIRED: 'REVERIFICATION_REQUIRED',
  ASSET_UPLOAD_IN_PROGRESS: 'IN_PROGRESS',
  SECURE_LINK_UNAVAILABLE: 'UNAVAILABLE',
};

/**
 * The upload refusals that become a note beside the file control.
 *
 * `UNAVAILABLE` is absent for the same reason it is absent from the initiation's
 * noticeable set: it means the grant is gone, and the screen answers it with the
 * one indistinguishable unavailable card rather than with a sentence about
 * images.
 */
export type NoticeableUploadFailure = Exclude<UploadFailure, 'UNAVAILABLE'>;

export function uploadFailureOf(error: NormalizedApiError): UploadFailure {
  const byCode = UPLOAD_BY_CODE[error.code];
  if (byCode !== undefined) return byCode;
  return genericOutcome(error);
}

/**
 * Whether a stale quota count is the likely cause, so the list is worth re-reading.
 *
 * §18: when the server refuses because the client's count was stale, refetch the
 * evidence status rather than arguing with it. Bounded to the two refusals that
 * are statements about the attempt's own stored set — a media refusal says
 * nothing about how many images exist, and re-reading on it would be a request
 * fired for no reason.
 */
export function requiresEvidenceRefetch(failure: UploadFailure): boolean {
  return failure === 'QUOTA_REACHED' || failure === 'ATTEMPT_CLOSED';
}

/**
 * The status-only reading both surfaces share.
 *
 * - **No `httpStatus`** — `NETWORK_ERROR`, `REQUEST_TIMEOUT`,
 *   `UNEXPECTED_CLIENT_ERROR`. The request never reached a verdict, so the
 *   customer may try again and nothing about the money is known either way.
 * - **`429`** — the secure-link limiter counts requests and never outcomes,
 *   precisely so it cannot become a validity oracle, which is exactly why a 429
 *   says nothing about the link.
 * - **`5xx`** — the server failed, not the link.
 * - **`404`** — a definitive refusal, and the only one. Treated as unavailable
 *   rather than retryable, because offering a retry against something that will
 *   never succeed is worse than ending the attempt.
 * - **anything else with a code this screen does not know** — `TRANSIENT`, which
 *   offers a retry and claims nothing. A refusal we cannot read is not a licence
 *   to invent a meaning for it.
 */
function genericOutcome(error: NormalizedApiError): 'UNAVAILABLE' | 'TRANSIENT' {
  const status = error.httpStatus;
  if (status === undefined) return 'TRANSIENT';
  if (status === 429) return 'TRANSIENT';
  if (status >= 500) return 'TRANSIENT';
  if (status === 404) return 'UNAVAILABLE';
  return 'TRANSIENT';
}
