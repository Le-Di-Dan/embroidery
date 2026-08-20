/**
 * The answers the two Admin drafting mutations may give (`APP6-B01`).
 *
 * Every member is either a rule the operator broke or a state the subject is
 * in — never a constraint name, a column, a SQL fragment or a hint about a
 * capability that ships later. In particular nothing here names sending,
 * acceptance, expiry, a secure link or a notification: those are `APP6-B03`+,
 * and an error message is a place an unreleased surface leaks.
 *
 * The caller is an authenticated operator behind `AuthenticatedAdminGuard`, so
 * the answers may be specific about what *they* typed. They still name no
 * customer, contact value, token or storage key.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const QUOTATION_DRAFTING_FAILURES = [
  /** No `custom_requests` row with that id. */
  'REQUEST_NOT_FOUND',
  /**
   * The request has not reached review, or has left the lifecycle entirely
   * (`TR-LC12-01`: "request ≥ UNDER_REVIEW").
   */
  'REQUEST_NOT_QUOTABLE',
  /** CST-035: one quotation per request. A second one is a new *version*. */
  'QUOTATION_ALREADY_EXISTS',
  /** No `quotations` row with that id. */
  'QUOTATION_NOT_FOUND',
  /** The quotation reached a terminal header state; nothing more is drafted on it. */
  'QUOTATION_NOT_DRAFTABLE',
  /**
   * The submitted pricing cannot be represented: a non-whole đồng, an amount
   * outside the column, a negative total, or an adjustment with no reason.
   */
  'QUOTATION_PRICING_INVALID',
  /** `quotation.deposit` is unpublished or unusable, so no split can be derived. */
  'QUOTATION_POLICY_UNAVAILABLE',
] as const;

export type QuotationDraftingFailure = (typeof QUOTATION_DRAFTING_FAILURES)[number];

export class QuotationDraftingError extends Error {
  readonly failure: QuotationDraftingFailure;
  /** Operator-facing detail for the one failure that has many causes. */
  readonly detail: string | undefined;

  constructor(failure: QuotationDraftingFailure, detail?: string) {
    super(failure);
    this.name = 'QuotationDraftingError';
    this.failure = failure;
    this.detail = detail;
  }
}

export function isQuotationDraftingError(error: unknown): error is QuotationDraftingError {
  return error instanceof QuotationDraftingError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling.
 *
 * `QUOTATION_POLICY_UNAVAILABLE` is a **503**, following the APP4 precedent for
 * an unpublished policy: nothing about the request is wrong and the condition is
 * one operator action away from resolved. The 409s are conflicts about state,
 * the 400 is about what the body carried.
 */
const RESPONSE_OF: Readonly<
  Record<QuotationDraftingFailure, (detail: string | undefined) => HttpException>
> = {
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  REQUEST_NOT_QUOTABLE: () =>
    new HttpException(
      {
        code: 'REQUEST_NOT_QUOTABLE',
        message: 'This request is not in a state that can be quoted.',
      },
      HttpStatus.CONFLICT,
    ),
  QUOTATION_ALREADY_EXISTS: () =>
    new HttpException(
      {
        code: 'QUOTATION_ALREADY_EXISTS',
        message: 'This request already has a quotation. Add a version to it instead.',
      },
      HttpStatus.CONFLICT,
    ),
  QUOTATION_NOT_FOUND: () =>
    new HttpException(
      { code: 'QUOTATION_NOT_FOUND', message: 'No such quotation.' },
      HttpStatus.NOT_FOUND,
    ),
  QUOTATION_NOT_DRAFTABLE: () =>
    new HttpException(
      {
        code: 'QUOTATION_NOT_DRAFTABLE',
        message: 'This quotation is closed, so no further version can be drafted on it.',
      },
      HttpStatus.CONFLICT,
    ),
  QUOTATION_PRICING_INVALID: (detail) =>
    new HttpException(
      {
        code: 'QUOTATION_PRICING_INVALID',
        message: detail ?? 'This pricing cannot be quoted.',
      },
      HttpStatus.BAD_REQUEST,
    ),
  QUOTATION_POLICY_UNAVAILABLE: () =>
    new HttpException(
      { message: 'Quotation drafting is temporarily unavailable.' },
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedDrafting<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isQuotationDraftingError(error)) {
      throw RESPONSE_OF[error.failure](error.detail);
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a
    // response by this file.
    throw error;
  }
}
