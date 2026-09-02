/**
 * The bounded refusals `POST /api/public/ready-made-orders` may give
 * (`APP12-B02` §37).
 *
 * Every code is either inherited from a delivered catalogue — `BR-022`'s
 * availability rule, GRD-012/GRD-030's idempotency outcomes, GRD-001's
 * verification precondition — or is the Ready-Made spelling of one. None is
 * invented for convenience. They travel in the standard error envelope as
 * stable business codes (`BACKEND_CONVENTIONS` §6), promoted by the platform
 * mapper from the exception payload's `code`.
 *
 * ### Every refusal throws, and therefore commits nothing
 *
 * A refused creation has no evidence to keep: no order, no line, no shipping
 * detail, no reservation and no completed idempotency record. So a refusal is
 * an error that rolls the whole transaction back, which is what makes "no
 * partial side effect" a property of the transaction rather than a promise this
 * file makes.
 *
 * ### What no message says
 *
 * No message names a customer, a contact value, a challenge, an order, a
 * reservation, a stock anchor, a quantity currently available, another order's
 * existence, a SQL state or a constraint. `SKU_NOT_AVAILABLE` and
 * `INSUFFICIENT_STOCK` in particular publish **no number**: telling an
 * anonymous caller how many units stand behind a SKU turns a checkout endpoint
 * into an inventory read (`BR-032`'s privacy rule, applied to the write side).
 * Zero stock is an ordinary business refusal, not a fault.
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';

export const READY_MADE_ORDER_FAILURES = [
  /** GRD-001 — no live, verified challenge backs this call. */
  'VERIFIED_CONTACT_REQUIRED',
  /**
   * `BR-022` — the SKU is not something Ready-Made may sell right now: unknown,
   * inactive, on an inactive variant, on an unpublished Product, in a category
   * that is not public, or carrying a price this path cannot resolve exactly.
   *
   * One code for all of them, deliberately. Distinguishing them would let an
   * anonymous caller enumerate unpublished Catalog rows by probing SKU ids,
   * which is the same disclosure the public product 404 already collapses.
   */
  'SKU_NOT_AVAILABLE',
  /** `BR-022` — the SKU is sellable, but not this many units right now. */
  'INSUFFICIENT_STOCK',
  /** GRD-030 — the same key was already used for a different request. */
  'IDEMPOTENCY_CONFLICT',
  /** GRD-012 — another attempt on this key is mid-flight. Retryable. */
  'DUPLICATE_OPERATION',
] as const;

export type ReadyMadeOrderFailure = (typeof READY_MADE_ORDER_FAILURES)[number];

export class ReadyMadeOrderError extends Error {
  constructor(readonly failure: ReadyMadeOrderFailure) {
    super(`Ready-Made order creation refused: ${failure}`);
    this.name = 'ReadyMadeOrderError';
  }
}

export function isReadyMadeOrderError(error: unknown): error is ReadyMadeOrderError {
  return error instanceof ReadyMadeOrderError;
}

interface PublicRefusal {
  readonly status: HttpStatus;
  readonly message: string;
}

/**
 * The published answer for each failure.
 *
 * `422` for a rule this request breaks, `409` for the two idempotency outcomes
 * — which are about a *previous* call on the same key rather than about this
 * body, and which a client resolves by reading the first result instead of by
 * editing anything.
 *
 * `INSUFFICIENT_STOCK` is `422` and not `409`: it is not a conflict between two
 * versions of the same thing, it is this request asking for more than exists,
 * and the client's remedy is to order fewer units.
 */
const REFUSAL_OF: Readonly<Record<ReadyMadeOrderFailure, PublicRefusal>> = {
  VERIFIED_CONTACT_REQUIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'That contact verification cannot be used to place an order.',
  },
  SKU_NOT_AVAILABLE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'That item is not available to order.',
  },
  INSUFFICIENT_STOCK: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'There is not enough stock for that quantity.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'This verification was already used to place a different order.',
  },
  DUPLICATE_OPERATION: {
    status: HttpStatus.CONFLICT,
    message: 'This order is already being placed. Please try again in a moment.',
  },
};

export function readyMadeOrderFailureResponse(failure: ReadyMadeOrderFailure): HttpException {
  const refusal = REFUSAL_OF[failure];
  return new HttpException({ code: failure, message: refusal.message }, refusal.status);
}

/**
 * The persistence verdicts this command owns, and only those.
 *
 * `IdempotencyStore.claim`'s two guard codes, and the two the delivered
 * Inventory writer raises. Everything else travels as **itself** to the
 * platform filter, which sanitises it: shaping an unknown error into a bounded
 * refusal would report a defect to a customer as an ordinary "that is out of
 * stock", and the next person to read the logs would find nothing wrong.
 */
const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
const IDEMPOTENCY_RECORD_VANISHED = 'IDEMPOTENCY_RECORD_VANISHED';
const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK';
/** `StockAnchor.requireLocked` — the SKU has no `sku_stocks` row at all. */
const STOCK_ANCHOR_MISSING = 'RECORD_NOT_FOUND';

function isCode(error: unknown, code: string): boolean {
  return isPersistenceError(error) && error.code === code;
}

/**
 * Translates a persistence failure into a bounded refusal, or returns it
 * unchanged.
 *
 * ### Why a missing stock anchor is `INSUFFICIENT_STOCK`
 *
 * `APP12-B02` §17: a commerce writer does not provision one. The anchor is
 * operator-owned inventory data — `APP8-B01`'s Admin provisioner is the only
 * path that creates it — and the public read already treats a missing anchor as
 * zero available (`APP12-B01`). Creating one here would make an anonymous
 * checkout write the inventory tables and would let a SKU nobody has stocked be
 * sold. So the customer gets the same refusal they would get for a SKU that is
 * simply out of stock, which is exactly what it is.
 */
export function classifyReadyMadeOrderFailure(error: unknown): unknown {
  if (isCode(error, IDEMPOTENCY_CONFLICT)) {
    return new ReadyMadeOrderError('IDEMPOTENCY_CONFLICT');
  }
  if (isCode(error, IDEMPOTENCY_RECORD_VANISHED)) {
    // The row conflicted a statement ago and was unreadable a statement later:
    // another attempt on this same challenge holds it. Reported as the
    // retryable in-progress outcome rather than as a server fault.
    return new ReadyMadeOrderError('DUPLICATE_OPERATION');
  }
  if (isCode(error, INSUFFICIENT_STOCK) || isCode(error, STOCK_ANCHOR_MISSING)) {
    return new ReadyMadeOrderError('INSUFFICIENT_STOCK');
  }
  return error;
}
