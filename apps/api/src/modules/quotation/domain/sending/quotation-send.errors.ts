/**
 * The answers the Admin send mutation may give (`APP6-B03`).
 *
 * Every member is a rule the operator broke or a state a subject is in. Nothing
 * here names a customer, a contact value, a secure link, a grant, a token, a
 * storage key or a constraint — the send is the first APP6 operation with a
 * customer-facing consequence, and an error message is where that surface would
 * leak first.
 *
 * `QUOTATION_VERSION_NOT_FOUND` is deliberately the same answer for "no such
 * version" and "that version belongs to a different quotation", exactly as the
 * `APP6-B02` reads answer: the version id locates a row, it does not authorize
 * one, and the alternative would let a wrong path confirm that a version exists
 * under someone else's quotation.
 *
 * There is no `QUOTED` failure and no transition target in this list. The
 * request move is a projection of the committed send (`APP6-G01` §4.1); an
 * operator never commands it, so no refusal can mention commanding it.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const QUOTATION_SEND_FAILURES = [
  /** No `quotations` row with that id. */
  'QUOTATION_NOT_FOUND',
  /** No version with that id **under this quotation**. */
  'QUOTATION_VERSION_NOT_FOUND',
  /**
   * The version is not a draft, and is not the already-sent current version
   * whose send would simply replay. A settled price is never re-sent.
   */
  'QUOTATION_VERSION_NOT_SENDABLE',
  /** The quotation's request row is gone — a repository invariant, not a state. */
  'REQUEST_NOT_FOUND',
  /**
   * The request is not in a state a quotation may be sent from
   * (`quotation-send-eligibility.ts`).
   */
  'REQUEST_NOT_SENDABLE',
  /** The request moved between the eligibility read and the transition. */
  'REQUEST_TRANSITION_STALE',
  /** LC-11 refused the projection. Unreachable through the guard above. */
  'INVALID_TRANSITION',
  /** `quotation.validity` is unpublished or unusable, so no window can be set. */
  'QUOTATION_POLICY_UNAVAILABLE',
] as const;

export type QuotationSendFailure = (typeof QUOTATION_SEND_FAILURES)[number];

export class QuotationSendError extends Error {
  readonly failure: QuotationSendFailure;

  constructor(failure: QuotationSendFailure) {
    super(failure);
    this.name = 'QuotationSendError';
    this.failure = failure;
  }
}

export function quotationSendError(failure: QuotationSendFailure): QuotationSendError {
  return new QuotationSendError(failure);
}

export function isQuotationSendError(error: unknown): error is QuotationSendError {
  return error instanceof QuotationSendError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 *
 * `QUOTATION_POLICY_UNAVAILABLE` is a **503** on the `APP6-B01` precedent:
 * nothing about the request is wrong and the condition is one operator action —
 * publishing the dataset — away from resolved.
 */
const RESPONSE_OF: Readonly<Record<QuotationSendFailure, () => HttpException>> = {
  QUOTATION_NOT_FOUND: () =>
    new HttpException(
      { code: 'QUOTATION_NOT_FOUND', message: 'No such quotation.' },
      HttpStatus.NOT_FOUND,
    ),
  QUOTATION_VERSION_NOT_FOUND: () =>
    new HttpException(
      { code: 'QUOTATION_VERSION_NOT_FOUND', message: 'This quotation has no such version.' },
      HttpStatus.NOT_FOUND,
    ),
  QUOTATION_VERSION_NOT_SENDABLE: () =>
    new HttpException(
      {
        code: 'QUOTATION_VERSION_NOT_SENDABLE',
        message: 'This version cannot be sent. Draft a new version instead.',
      },
      HttpStatus.CONFLICT,
    ),
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  REQUEST_NOT_SENDABLE: () =>
    new HttpException(
      {
        code: 'REQUEST_NOT_SENDABLE',
        message: 'This request is not in a state a quotation can be sent from.',
      },
      HttpStatus.CONFLICT,
    ),
  REQUEST_TRANSITION_STALE: () =>
    new HttpException(
      {
        code: 'REQUEST_TRANSITION_STALE',
        message: 'This request changed state before the quotation could be sent.',
      },
      HttpStatus.CONFLICT,
    ),
  INVALID_TRANSITION: () =>
    new HttpException(
      {
        code: 'INVALID_TRANSITION',
        message: 'That status change is not allowed for this request.',
      },
      HttpStatus.CONFLICT,
    ),
  QUOTATION_POLICY_UNAVAILABLE: () =>
    new HttpException(
      { message: 'Sending a quotation is temporarily unavailable.' },
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedQuotationSend<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isQuotationSendError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    // Anything else propagates to the platform filter, which sanitises it. A
    // `PersistenceError` names a constraint and can quote a column; shaping one
    // into a response here is how that would reach an HTTP client.
    throw error;
  }
}
