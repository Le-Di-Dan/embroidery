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
 *
 * ## The access bootstrap (`APP12-B04` §7, §32)
 *
 * `APP12-B04` added `access` on top of this shape, additively: every B02 field
 * keeps its name, its meaning and its position, so an existing client reading
 * this result is unaffected.
 *
 * It carries **no token and no grant id**. The raw `ORDER_ACCESS` token exists
 * once, in the creating transaction, and only its peppered digest is stored, so
 * a replay — which re-issues nothing — has no plaintext to reproduce. Persisting
 * one here to make replays byte-identical would mean writing a live bearer
 * credential into `idempotency_records.result`, which is precisely what the
 * digest exists to prevent; the customer's link travels the APP4 notification
 * path instead, exactly as `APP5-B01`'s submission result records for its own
 * grant. What is here — the scope and the expiry — are facts of the grant, not
 * secrets, so a first creation and a replay of it publish the same three values.
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

/**
 * That the order is reachable, and until when.
 *
 * Three plain facts and no credential. `delivered` reports that the link was
 * handed to the APP4 notification path for the customer's own primary verified
 * contact; it names no destination, because the issuer has no parameter one
 * could be supplied through.
 */
export interface ReadyMadeOrderAccessBootstrap {
  readonly scopeKind: string;
  readonly delivered: boolean;
  /** ISO-8601. When the secure link stops opening the order. */
  readonly expiresAt: string;
}

export interface CreatedReadyMadeOrderResult {
  /** Human order code. Quotable to support; never a credential (CST-026). */
  readonly orderCode: string;
  readonly status: string;
  readonly merchandiseSubtotal: ReadyMadeSubtotal;
  /** ISO-8601. When the held stock is released if the order is not paid for. */
  readonly reservationExpiresAt: string;
  readonly access: ReadyMadeOrderAccessBootstrap;
}

function isSubtotal(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['amount'] === 'string' && typeof record['currency'] === 'string';
}

/**
 * The access bootstrap, checked as strictly as the subtotal beside it.
 *
 * A record written before `APP12-B04` carries no `access` key, so a replay of a
 * pre-B04 creation fails this check and is reported as unreplayable rather than
 * served without the field. That is the honest answer: the alternative is a
 * `201` telling a customer nothing about how to reach their order, and the
 * records in question live only for the idempotency TTL.
 */
function isAccessBootstrap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['scopeKind'] === 'string' &&
    typeof record['delivered'] === 'boolean' &&
    typeof record['expiresAt'] === 'string'
  );
}

/** Reads a stored result back, refusing anything that is not the published shape. */
export function decodeReadyMadeOrderResult(stored: unknown): CreatedReadyMadeOrderResult {
  if (typeof stored === 'object' && stored !== null) {
    const record = stored as Record<string, unknown>;
    if (
      typeof record['orderCode'] === 'string' &&
      typeof record['status'] === 'string' &&
      typeof record['reservationExpiresAt'] === 'string' &&
      isSubtotal(record['merchandiseSubtotal']) &&
      isAccessBootstrap(record['access'])
    ) {
      return stored as unknown as CreatedReadyMadeOrderResult;
    }
  }
  throw new Error('A completed readyMadeOrder.create record does not carry a replayable result.');
}
