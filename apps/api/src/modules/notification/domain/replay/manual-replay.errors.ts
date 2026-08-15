/**
 * The answers Admin manual replay may give (`APP4-B08`).
 *
 * Four refusals, and the boundary between two of them is the rule that matters
 * most in this file.
 *
 * ### `REISSUE_REQUIRED` is a routing signal, not a generic conflict
 *
 * IMP-D049 PO-11 locks it to one meaning: *the business secret this delivery
 * carries is no longer usable, so re-sending it would help nobody — go and make
 * a new one.* It tells the operator to use `APP4-B03` resend for a fresh code or
 * `APP4-B05` reissue for a fresh token, and it is the only refusal that carries
 * that instruction.
 *
 * So it is **not** returned when the intent is simply in the wrong state. An
 * operator who clicks replay on a `SATISFIED` intent has not hit an expired
 * secret; they have asked to replay something that was delivered, and telling
 * them to mint a new credential for a customer who already received one would
 * be actively wrong. That case is `REPLAY_NOT_APPLICABLE`, a plain state
 * conflict.
 *
 * ### Nothing here names a secret
 *
 * No message mentions a code, a token, a digest, a recipient or a template body.
 * A refusal says which *rule* refused and nothing about the credential behind
 * it.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const MANUAL_REPLAY_FAILURES = [
  /** No `notification_intents` row with that id. */
  'INTENT_NOT_FOUND',
  /**
   * The intent exists but is not terminal-failed, so there is no exhausted
   * delivery to replay. Covers `PENDING`, `PROCESSING`, `SATISFIED` and
   * `CANCELLED` alike — all four mean "this is not a terminal transport
   * failure", and an operator's next step is the same for every one of them.
   */
  'REPLAY_NOT_APPLICABLE',
  /**
   * The business secret behind this delivery can no longer be used: the
   * challenge is expired, answered, failed or cancelled, or the grant is
   * expired, revoked or superseded. The locked routing signal (IMP-D049 PO-11).
   */
  'REISSUE_REQUIRED',
  /**
   * The stored evidence cannot be replayed as it stands — no terminal
   * `DEAD_LETTER` delivery event for this intent, more than one, or `params`
   * that does not satisfy the `APP4-B01` reference contract.
   *
   * Deliberately **not** `REISSUE_REQUIRED`: nothing about the customer's secret
   * has expired, and routing an operator to mint a new credential because a row
   * is malformed would issue a real secret to paper over a persistence defect.
   */
  'REPLAY_SOURCE_UNAVAILABLE',
] as const;

export type ManualReplayFailure = (typeof MANUAL_REPLAY_FAILURES)[number];

/**
 * A replay refusal.
 *
 * Thrown rather than returned, following `SecureGrantError`: every path here
 * either produces a replay or leaves the database exactly as it was, so
 * unwinding the transaction is the correct effect.
 */
export class ManualReplayError extends Error {
  readonly failure: ManualReplayFailure;

  constructor(failure: ManualReplayFailure) {
    super(failure);
    this.name = 'ManualReplayError';
    this.failure = failure;
  }
}

export function isManualReplayError(error: unknown): error is ManualReplayError {
  return error instanceof ManualReplayError;
}

/**
 * The published status, business code and message for each failure.
 *
 * An exhaustive `Record`, so a new failure without a published answer stops
 * compiling rather than reaching a client as an unmapped 500. The `code` field
 * is what the platform envelope publishes as the stable business code.
 */
const RESPONSE_OF: Readonly<Record<ManualReplayFailure, () => HttpException>> = {
  INTENT_NOT_FOUND: () =>
    new HttpException(
      { code: 'NOT_FOUND', message: 'No such notification intent.' },
      HttpStatus.NOT_FOUND,
    ),
  REPLAY_NOT_APPLICABLE: () =>
    new HttpException(
      {
        code: 'REPLAY_NOT_APPLICABLE',
        message: 'Only a notification that failed delivery can be replayed.',
      },
      HttpStatus.CONFLICT,
    ),
  REISSUE_REQUIRED: () =>
    new HttpException(
      {
        code: 'REISSUE_REQUIRED',
        message:
          'The code or link this notification carries is no longer valid. Issue a new one instead.',
      },
      HttpStatus.CONFLICT,
    ),
  REPLAY_SOURCE_UNAVAILABLE: () =>
    new HttpException(
      {
        code: 'REPLAY_SOURCE_UNAVAILABLE',
        message: 'This notification has no replayable delivery record.',
      },
      HttpStatus.CONFLICT,
    ),
};

export function manualReplayFailureResponse(failure: ManualReplayFailure): HttpException {
  return RESPONSE_OF[failure]();
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedReplayOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isManualReplayError(error)) {
      throw manualReplayFailureResponse(error.failure);
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a response
    // by this file.
    throw error;
  }
}
