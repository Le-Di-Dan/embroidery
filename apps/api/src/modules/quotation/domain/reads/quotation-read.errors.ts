/**
 * The answers the two Admin quotation reads may give (`APP6-B02`).
 *
 * Two, and the list stays two because a read has almost no way to fail. There
 * is no `QUOTATION_NOT_DRAFTABLE`, no stale-version conflict and no expiry
 * refusal here: those are answers a *write* gives, and minting one in advance of
 * the mutation that raises it is a contract promise nothing keeps. `APP6-B03`
 * owns sending and `APP6-B04` owns acceptance; neither is reachable from a GET.
 *
 * `QUOTATION_VERSION_NOT_FOUND` is deliberately the same answer for "no such
 * version" and "that version belongs to a different quotation". The version id
 * is a locator, not an authority, and an operator who mistypes one learns only
 * that this quotation does not have it — the alternative would let the wrong
 * path confirm the existence of another quotation's row.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const QUOTATION_READ_FAILURES = [
  /** No `quotations` row with that id. */
  'QUOTATION_NOT_FOUND',
  /** No version with that id **under this quotation**. */
  'QUOTATION_VERSION_NOT_FOUND',
] as const;

export type QuotationReadFailure = (typeof QUOTATION_READ_FAILURES)[number];

export class QuotationReadError extends Error {
  readonly failure: QuotationReadFailure;

  constructor(failure: QuotationReadFailure) {
    super(failure);
    this.name = 'QuotationReadError';
    this.failure = failure;
  }
}

export function quotationReadError(failure: QuotationReadFailure): QuotationReadError {
  return new QuotationReadError(failure);
}

export function isQuotationReadError(error: unknown): error is QuotationReadError {
  return error instanceof QuotationReadError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<QuotationReadFailure, () => HttpException>> = {
  QUOTATION_NOT_FOUND: () =>
    new HttpException(
      { code: 'QUOTATION_NOT_FOUND', message: 'No such quotation.' },
      HttpStatus.NOT_FOUND,
    ),
  QUOTATION_VERSION_NOT_FOUND: () =>
    new HttpException(
      {
        code: 'QUOTATION_VERSION_NOT_FOUND',
        message: 'This quotation has no such version.',
      },
      HttpStatus.NOT_FOUND,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedQuotationRead<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isQuotationReadError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    // Anything else propagates to the platform filter, which sanitises it — a
    // `PersistenceError` names a constraint and can quote a column, and shaping
    // one into a response here is how that would reach an HTTP client.
    throw error;
  }
}
