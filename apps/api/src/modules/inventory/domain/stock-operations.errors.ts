/**
 * The closed refusal vocabulary of the three Admin stock operations
 * (`APP8-B01`).
 *
 * Two entries, and no more. Everything else a caller can get wrong is already
 * answered by a delivered mechanism and is deliberately **not** repeated here:
 * a malformed id or a missing reason is the Zod pipe's `400`, no session is
 * `AuthenticatedAdminGuard`'s `401`, a foreign origin is `StaffOriginGuard`'s
 * `403`, and a non-JSON body is `StaffJsonBodyGuard`'s `415`. `APP8-B01` §9
 * asks for a new code only where the repository genuinely cannot express the
 * failure, and these are the two such cases:
 *
 * - **`SKU_NOT_FOUND`** — `sku_stocks.sku_id` carries `fk_sku_stocks__sku_id`
 *   (REL-026), so the *database* is the authority on whether a SKU exists. The
 *   application does not read `skus` to find out — that would be a second
 *   authority on Catalog truth, reachable from an Inventory injector, that
 *   could disagree with the FK it is imitating. The insert is attempted and the
 *   FK's rejection is translated here.
 * - **`STOCK_WOULD_GO_NEGATIVE`** — `ck_sku_stocks__quantity_non_negative`
 *   (CST-061 / INV-18) makes negative on-hand unrepresentable, and DB3 LC-17
 *   states the override is *"GRD-023 audited admin action on adjustments only,
 *   never negative stock"*. The CHECK stays the backstop; this is the
 *   application guard that refuses the adjustment **under the anchor lock**, so
 *   the operator is told what they asked for rather than being handed a
 *   sanitised constraint failure.
 *
 * Neither message names a quantity, a SKU code, a constraint or a table. An
 * authenticated operator learns only what they asked about.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const STOCK_OPERATION_FAILURES = [
  /** No `skus` row with that id — the FK refused the stock anchor. */
  'SKU_NOT_FOUND',
  /** The adjustment would take `quantity_on_hand` below zero (CST-061, GRD-023). */
  'STOCK_WOULD_GO_NEGATIVE',
] as const;

export type StockOperationFailure = (typeof STOCK_OPERATION_FAILURES)[number];

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: a failure added without a status
 * stops compiling, which is the only way a new refusal cannot reach a client as
 * an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<StockOperationFailure, () => HttpException>> = {
  SKU_NOT_FOUND: () =>
    new NotFoundException({
      code: 'INVENTORY_SKU_NOT_FOUND',
      message: 'No such SKU.',
    }),
  STOCK_WOULD_GO_NEGATIVE: () =>
    new ConflictException({
      code: 'INVENTORY_STOCK_WOULD_GO_NEGATIVE',
      message: 'That adjustment would take stock below zero.',
    }),
};

export class StockOperationError extends Error {
  readonly failure: StockOperationFailure;

  constructor(failure: StockOperationFailure) {
    super(failure);
    this.name = 'StockOperationError';
    this.failure = failure;
  }
}

export function stockOperationError(failure: StockOperationFailure): StockOperationError {
  return new StockOperationError(failure);
}

export function isStockOperationError(error: unknown): error is StockOperationError {
  return error instanceof StockOperationError;
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedStockOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isStockOperationError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
