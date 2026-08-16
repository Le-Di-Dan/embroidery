/**
 * The answers the two Admin moderation mutations may give (`APP5-B05` §10).
 *
 * Every member is either a rule the operator broke or a state the request is
 * in — never a constraint name, a column, a SQL fragment or a hint that a
 * capability exists somewhere else. In particular nothing here names `QUOTED`,
 * a quotation, a design version or any other APP6 concept: an error message is
 * a place an unreleased surface leaks, and `INVALID_TRANSITION` says what was
 * refused without describing what would have been allowed in a later phase.
 *
 * The caller is an authenticated operator behind `AuthenticatedAdminGuard`, so
 * the answers may be specific about what *they* typed. They still name no
 * customer id, contact value, token, digest or storage key.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

import type { ModerationPolicyFailure } from './request-moderation.policy';

export const MODERATION_FAILURES = [
  /** No `custom_requests` row with that id. */
  'REQUEST_NOT_FOUND',
  /** The move is not one APP5 offers from the state the request is in. */
  'INVALID_TRANSITION',
  /**
   * The request left the state this command was judged against before the lock
   * was granted — another operator moderated it first (`APP5-B05` §6).
   */
  'REQUEST_TRANSITION_STALE',
  'TRANSITION_REASON_REQUIRED',
  'TRANSITION_CUSTOMER_REASON_REQUIRED',
  'TRANSITION_CUSTOMER_REASON_NOT_ALLOWED',
  'MODERATION_NOTE_REQUIRED',
  'MODERATION_NOTE_KIND_INVALID',
] as const;

export type ModerationFailure = (typeof MODERATION_FAILURES)[number];

/**
 * Compile-time proof that every policy verdict has a transport answer.
 *
 * The policy returns a narrower union than this one; if a rule is added there
 * without being listed above, this alias stops resolving and the build fails
 * rather than the refusal reaching a client as an unmapped 500.
 */
type PolicyFailuresAreMapped = ModerationPolicyFailure extends ModerationFailure ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertPolicyFailuresAreMapped = PolicyFailuresAreMapped;

export class RequestModerationError extends Error {
  readonly failure: ModerationFailure;

  constructor(failure: ModerationFailure) {
    super(failure);
    this.name = 'RequestModerationError';
    this.failure = failure;
  }
}

export function isRequestModerationError(error: unknown): error is RequestModerationError {
  return error instanceof RequestModerationError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling.
 *
 * The two 409s are conflicts about *state*, not about input — the operator's
 * command was well-formed and the request was not in a shape that accepts it.
 * The 400s are all about what the body carried, so a client can fix one by
 * changing what it sends.
 */
const RESPONSE_OF: Readonly<Record<ModerationFailure, () => HttpException>> = {
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  INVALID_TRANSITION: () =>
    new HttpException(
      {
        code: 'INVALID_TRANSITION',
        message: 'That status change is not available for this request.',
      },
      HttpStatus.CONFLICT,
    ),
  REQUEST_TRANSITION_STALE: () =>
    new HttpException(
      {
        code: 'REQUEST_TRANSITION_STALE',
        message: 'This request was moderated by someone else. Reload it and decide again.',
      },
      HttpStatus.CONFLICT,
    ),
  TRANSITION_REASON_REQUIRED: () =>
    new HttpException(
      { code: 'TRANSITION_REASON_REQUIRED', message: 'An internal reason is required.' },
      HttpStatus.BAD_REQUEST,
    ),
  TRANSITION_CUSTOMER_REASON_REQUIRED: () =>
    new HttpException(
      {
        code: 'TRANSITION_CUSTOMER_REASON_REQUIRED',
        message: 'A customer-visible reason is required.',
      },
      HttpStatus.BAD_REQUEST,
    ),
  TRANSITION_CUSTOMER_REASON_NOT_ALLOWED: () =>
    new HttpException(
      {
        code: 'TRANSITION_CUSTOMER_REASON_NOT_ALLOWED',
        message: 'This status change tells the customer nothing, so it carries no message.',
      },
      HttpStatus.BAD_REQUEST,
    ),
  MODERATION_NOTE_REQUIRED: () =>
    new HttpException(
      {
        code: 'MODERATION_NOTE_REQUIRED',
        message: 'A moderation note and its kind are required for this status change.',
      },
      HttpStatus.BAD_REQUEST,
    ),
  MODERATION_NOTE_KIND_INVALID: () =>
    new HttpException(
      {
        code: 'MODERATION_NOTE_KIND_INVALID',
        message: 'That note kind does not describe this status change.',
      },
      HttpStatus.BAD_REQUEST,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedModeration<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isRequestModerationError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a response
    // by this file.
    throw error;
  }
}
