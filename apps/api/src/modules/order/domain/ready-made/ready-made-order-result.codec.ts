/**
 * The `readyMadeOrder.create` result, and how it is read back out of the
 * idempotency record (`APP12-B02` §22, §24).
 *
 * The shape is deliberately **identical** to what a first creation returns, so
 * a first call and a replay of it are indistinguishable to a client — which is
 * what makes a safe retry actually safe (`BR-023`).
 *
 * ## Customer-safe references only
 *
 * The human order code, the customer-facing status, the frozen merchandise
 * subtotal and the reservation deadline. **No** order UUID, reservation id,
 * stock anchor id, customer id, SKU id, challenge id or idempotency key:
 * `BR-032` keeps raw internal identifiers off the customer surface, and a value
 * published here becomes a contract every later checkpoint has to keep.
 * `APP12-B04` adds secure order access on top of this shape, additively — it
 * does not need a UUID leaked here first.
 *
 * ## Why the decode is strict
 *
 * A stored result is `jsonb` and therefore `unknown` on the way out. Trusting it
 * structurally would let a malformed record become a `201` describing an order
 * that does not exist, so a bad shape is a **fault** — the same rule
 * `request-intake-result.codec.ts` and `submit-custom-request.use-case.ts`
 * already apply to their own stored results.
 */

/** The merchandise subtotal, in the one public money shape (`{ amount, currency }`). */
export interface ReadyMadeSubtotal {
  readonly amount: string;
  readonly currency: string;
}

export interface CreatedReadyMadeOrderResult {
  /** Human order code. Quotable to support; never a credential (CST-026). */
  readonly orderCode: string;
  readonly status: string;
  readonly merchandiseSubtotal: ReadyMadeSubtotal;
  /** ISO-8601. When the held stock is released if the order is not paid for. */
  readonly reservationExpiresAt: string;
}

function isSubtotal(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['amount'] === 'string' && typeof record['currency'] === 'string';
}

/** Reads a stored result back, refusing anything that is not the published shape. */
export function decodeReadyMadeOrderResult(stored: unknown): CreatedReadyMadeOrderResult {
  if (typeof stored === 'object' && stored !== null) {
    const record = stored as Record<string, unknown>;
    if (
      typeof record['orderCode'] === 'string' &&
      typeof record['status'] === 'string' &&
      typeof record['reservationExpiresAt'] === 'string' &&
      isSubtotal(record['merchandiseSubtotal'])
    ) {
      return stored as unknown as CreatedReadyMadeOrderResult;
    }
  }
  throw new Error('A completed readyMadeOrder.create record does not carry a replayable result.');
}
