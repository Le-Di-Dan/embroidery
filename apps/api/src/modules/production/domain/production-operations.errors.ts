/**
 * The closed refusal vocabulary of the Admin production operations
 * (`APP8-B03` §11, `APP8-B04` §19).
 *
 * Six entries at `APP8-B03`. Everything else a caller can get wrong is already answered by a
 * delivered mechanism and is deliberately **not** repeated here: a malformed id
 * or an unknown query parameter is the Zod pipe's `400`, no session is
 * `AuthenticatedAdminGuard`'s `401`, a foreign origin is `StaffOriginGuard`'s
 * `403`, and a non-JSON body is `StaffJsonBodyGuard`'s `415`. §11 asks for a new
 * code only where an existing mechanism cannot express the condition.
 *
 * ### Why `PRODUCTION_APPROVAL_MISMATCH` exists
 *
 * §11 requires this one to be justified rather than folded into a neighbour, so:
 *
 * - **A `404` would be misleading.** Both rows exist. The order is real, the
 *   approval snapshot is real, and the operator can read either of them through
 *   `APP7-B02`'s Admin order detail. Reporting "not found" would send them
 *   looking for a missing row instead of at the pairing they got wrong.
 * - **A generic `PRODUCTION_BLOCKED` would be worse.** "Blocked" is the
 *   vocabulary of a gate that may open later — the deposit gate below is exactly
 *   that, and it clears the moment the deposit is verified. A snapshot belonging
 *   to another order never becomes this order's approval, so a code that implies
 *   waiting would be false. It is a wrong request, not an early one.
 *
 * It is a `409` rather than a `400` because the request is well formed: two
 * valid ids that the *stored* relationship refuses to pair. That distinction is
 * what `409` means everywhere else in this repository.
 *
 * ### None of these messages names a stored value
 *
 * The caller is an authenticated operator behind `AuthenticatedAdminGuard`, and
 * no message here repeats an order code, a customer, an approval reference, an
 * amount or a constraint name. Nothing shapes a `PersistenceError`'s
 * diagnostics into a response either — a SQLSTATE and a constraint name reach
 * the platform filter, which sanitises them.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const PRODUCTION_OPERATION_FAILURES = [
  /** No `orders` row with that id. */
  'PRODUCTION_ORDER_NOT_FOUND',
  /** No `production_jobs` row with that id. */
  'PRODUCTION_JOB_NOT_FOUND',
  /** The named approval snapshot is not the one the order is produced against. */
  'PRODUCTION_APPROVAL_MISMATCH',
  /** GRD-013: the order's DEPOSIT obligation is not SATISFIED. */
  'PRODUCTION_DEPOSIT_NOT_SATISFIED',
  /** `uq_production_jobs__order_approval_snapshot` refused a second job. */
  'PRODUCTION_JOB_ALREADY_EXISTS',
  /** The supplied page cursor is not one this endpoint issued. */
  'PRODUCTION_CURSOR_INVALID',

  // --- `APP8-B04` — the guarded transitions -------------------------------
  //
  // Six more, and each answers a *different* operator action. The persistence
  // layer's own authority-named guard codes — `INVALID_TRANSITION`,
  // `CANCELLATION_REASON_REQUIRED`, `RESERVATION_NOT_ACTIVE` — are the internal
  // ones these translate; the published names keep this module's `PRODUCTION_`
  // prefix, which is how every other module in this repository publishes a
  // shared guard code (`payment.`, `design_version.`, `quotation.`).

  /** LC-18 does not allow that move from the job's committed state. */
  'PRODUCTION_INVALID_TRANSITION',
  /** A production job may not be cancelled without a recorded reason. */
  'PRODUCTION_CANCELLATION_REASON_REQUIRED',
  /** GRD-022: the order is ON_HOLD or CANCELLING. Production waits for the hold. */
  'PRODUCTION_ORDER_ON_HOLD',
  /** GRD-015: the order is not in the state this production move requires. */
  'PRODUCTION_BLOCKED',
  /** A required Catalog reservation is missing or already terminal. */
  'PRODUCTION_RESERVATION_NOT_ACTIVE',
  /** The reservation standing for a SKU does not cover the frozen quantity. */
  'PRODUCTION_RESERVATION_INSUFFICIENT',
] as const;

export type ProductionOperationFailure = (typeof PRODUCTION_OPERATION_FAILURES)[number];

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: a failure added without a status
 * stops compiling, which is the only way a new refusal cannot reach a client as
 * an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<ProductionOperationFailure, () => HttpException>> = {
  PRODUCTION_ORDER_NOT_FOUND: () =>
    new NotFoundException({ code: 'PRODUCTION_ORDER_NOT_FOUND', message: 'No such order.' }),
  PRODUCTION_JOB_NOT_FOUND: () =>
    new NotFoundException({
      code: 'PRODUCTION_JOB_NOT_FOUND',
      message: 'No such production job.',
    }),
  PRODUCTION_APPROVAL_MISMATCH: () =>
    new ConflictException({
      code: 'PRODUCTION_APPROVAL_MISMATCH',
      message: 'That approval does not belong to this order.',
    }),
  PRODUCTION_DEPOSIT_NOT_SATISFIED: () =>
    new ConflictException({
      code: 'PRODUCTION_DEPOSIT_NOT_SATISFIED',
      message: 'Production cannot start for this order: its deposit is not satisfied.',
    }),
  PRODUCTION_JOB_ALREADY_EXISTS: () =>
    new ConflictException({
      code: 'PRODUCTION_JOB_ALREADY_EXISTS',
      message: 'A production job already exists for this order and approval.',
    }),
  PRODUCTION_CURSOR_INVALID: () =>
    new BadRequestException({
      code: 'PRODUCTION_CURSOR_INVALID',
      message: 'That page cursor is not valid.',
    }),
  PRODUCTION_INVALID_TRANSITION: () =>
    new ConflictException({
      code: 'PRODUCTION_INVALID_TRANSITION',
      message: 'That status change is not allowed for this production job.',
    }),
  PRODUCTION_CANCELLATION_REASON_REQUIRED: () =>
    new BadRequestException({
      code: 'PRODUCTION_CANCELLATION_REASON_REQUIRED',
      message: 'A reason is required to cancel a production job.',
    }),
  PRODUCTION_ORDER_ON_HOLD: () =>
    new ConflictException({
      code: 'PRODUCTION_ORDER_ON_HOLD',
      message: 'This order is on hold or being cancelled; production cannot move it.',
    }),
  PRODUCTION_BLOCKED: () =>
    new ConflictException({
      code: 'PRODUCTION_BLOCKED',
      message: 'This order is not in a state that allows that production move.',
    }),
  PRODUCTION_RESERVATION_NOT_ACTIVE: () =>
    new ConflictException({
      code: 'PRODUCTION_RESERVATION_NOT_ACTIVE',
      message: 'An inventory reservation this order requires is missing or no longer active.',
    }),
  PRODUCTION_RESERVATION_INSUFFICIENT: () =>
    new ConflictException({
      code: 'PRODUCTION_RESERVATION_INSUFFICIENT',
      message: 'An inventory reservation this order requires does not cover its quantity.',
    }),
};

export class ProductionOperationError extends Error {
  readonly failure: ProductionOperationFailure;

  constructor(failure: ProductionOperationFailure) {
    super(failure);
    this.name = 'ProductionOperationError';
    this.failure = failure;
  }
}

export function productionOperationError(
  failure: ProductionOperationFailure,
): ProductionOperationError {
  return new ProductionOperationError(failure);
}

export function isProductionOperationError(error: unknown): error is ProductionOperationError {
  return error instanceof ProductionOperationError;
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedProductionOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isProductionOperationError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
