/**
 * What a refused submission means for the screen (`656:119`, `656:166`,
 * `656:213`).
 *
 * **Mapped by envelope code, never by message text.** `APP5-B01` publishes a
 * machine-readable `code` for every refusal (`SUBMISSION_FAILURES`), and
 * `normalizeApiClientError` puts it on `NormalizedApiError.code`. Branching on
 * the code means the server may reword any of these sentences without changing
 * which approved frame the customer sees — and it means none of the server's
 * prose reaches the screen, which §12 requires.
 *
 * **A network failure is not a refusal.** The one outcome that matters most here
 * is the request that never came back: the submission may or may not have been
 * created, so it maps to the approved *uncertain* frame whose action is a safe
 * retry, not to a failure frame that says nothing was created.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

/** One approved outcome frame per value. */
export type SubmissionOutcome =
  /** `656:166` — refused, and nothing was created. */
  | 'FAILED'
  /** `656:119` — the result is genuinely unknown; retry is safe. */
  | 'UNCERTAIN'
  /** `656:213`'s sibling — this challenge already made a *different* request. */
  | 'CONFLICT'
  /** Another attempt on this challenge is in flight. Retry shortly. */
  | 'IN_PROGRESS'
  /** The verification behind the submission is no longer usable. */
  | 'NOT_VERIFIED'
  /** The design session cannot be submitted — `650:187`. */
  | 'SESSION_UNUSABLE'
  /** One named asset was refused; the customer re-uploads it. */
  | 'ASSET_NOT_BINDABLE'
  /** Exactly one subject must be present. Unreachable through the UI. */
  | 'SUBJECT_INVALID';

const SERVER_ERROR = 500;

export function submissionOutcomeOf(error: NormalizedApiError): SubmissionOutcome {
  switch (error.code) {
    case 'IDEMPOTENCY_CONFLICT':
      return 'CONFLICT';
    case 'DUPLICATE_OPERATION':
      return 'IN_PROGRESS';
    case 'CUSTOMER_NOT_VERIFIED':
      return 'NOT_VERIFIED';
    case 'SESSION_EXPIRED':
    case 'SESSION_NOT_AUTHORIZED':
      return 'SESSION_UNUSABLE';
    case 'REQUEST_ASSET_NOT_BINDABLE':
      return 'ASSET_NOT_BINDABLE';
    case 'SUBMISSION_SUBJECT_INVALID':
      return 'SUBJECT_INVALID';
    default:
      break;
  }
  // The status, not the code, decides the rest — and it is checked first,
  // because a refusal whose body did not parse still normalizes to a *client*
  // code (`MALFORMED_RESPONSE`). Treating that as "never happened" would offer a
  // retry for a request the server has already considered and rejected.
  if (error.httpStatus !== undefined) {
    // A 5xx may have committed before failing, so the outcome is genuinely
    // unknown; a 4xx is a verdict.
    return error.httpStatus >= SERVER_ERROR ? 'UNCERTAIN' : 'FAILED';
  }

  // No response at all — network, timeout or a client-side throw. The
  // submission may or may not exist, which is exactly the uncertain frame.
  return 'UNCERTAIN';
}

/**
 * May the customer press submit again on the same form and challenge?
 *
 * `CONFLICT` is the one outcome where they may not: that challenge is spent on
 * a different request, and `APP5-S01` §15 forbids silently starting a fresh one.
 * Every other outcome leaves the challenge usable, and `APP5-B01`'s
 * challenge-scoped idempotency makes the retry safe.
 */
export function isRetryable(outcome: SubmissionOutcome): boolean {
  return outcome !== 'CONFLICT';
}
