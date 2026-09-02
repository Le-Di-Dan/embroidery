/**
 * What a verified payment settles **beyond** the money, per obligation kind
 * (`APP12-B05` §5, §11).
 *
 * ```text
 * DEPOSIT     NONE                    the deposit buys a place in the queue
 * REMAINING   NONE                    the stock was committed at production start
 * FULL        COMMIT_RESERVED_STOCK   the goods are sold the moment they are paid for
 * ```
 *
 * ### Why a table rather than an `if (kind === 'FULL')`
 *
 * For the same reason {@link verifiedPaymentTransitionFor} is one: a money
 * transaction that grows a branch per kind is how two kinds drift. This is the
 * third such table beside the LC-14 pair and the transfer-memo builder, keyed on
 * the same closed set, and the verification use case reads all three the same
 * way — from the kind the database reported, never from a request field and
 * never from an origin the caller supplied.
 *
 * ### Why the two custom kinds commit nothing
 *
 * They are not omissions. Custom commerce reserves stock when production is
 * scheduled and consumes it at production start (`TR-LC17-05`, `APP8-B04`), so
 * by the time the balance is verified the units are long gone from on-hand;
 * consuming again here would decrement twice. And a deposit is collected before
 * any reservation exists at all — `APP8-W01` reserves *because* the deposit was
 * paid, not during its verification. Ready-Made inverts that order: `APP12-B02`
 * reserves at checkout, against an unpaid order, and holds the stock on a
 * deadline. Payment is therefore the only moment at which those units stop
 * being a hold and become a sale.
 *
 * ### It names an effect, not an implementation
 *
 * The value is a verb this module is allowed to say; the inventory arithmetic
 * behind it belongs to APP8's consume writer and is reached through
 * {@link VerifiedPaymentSettlementPort}. Payment does not own stock, and a
 * second on-hand decrement living in this module is exactly what `APP12-B05` §5
 * forbids.
 */
import type { VerifiableObligationKind } from './verified-payment-transition';

export type VerifiedPaymentSettlementEffect = 'NONE' | 'COMMIT_RESERVED_STOCK';

const EFFECT_BY_KIND: Readonly<Record<VerifiableObligationKind, VerifiedPaymentSettlementEffect>> =
  {
    DEPOSIT: 'NONE',
    REMAINING: 'NONE',
    FULL: 'COMMIT_RESERVED_STOCK',
  };

export function verifiedPaymentSettlementFor(
  kind: VerifiableObligationKind,
): VerifiedPaymentSettlementEffect {
  return EFFECT_BY_KIND[kind];
}

export const VERIFIED_PAYMENT_SETTLEMENT_PORT = Symbol('VERIFIED_PAYMENT_SETTLEMENT_PORT');

/**
 * What the commitment did, in the vocabulary of the module that performed it.
 *
 * A returned verdict rather than a thrown refusal, so Ordering never imports
 * Payment's error family and Payment keeps sole authority over which refusal an
 * operator reads. Both non-success verdicts are reachable only through a real
 * race — the expiry sweep or a cancellation committing between this
 * transaction's unlocked read of the order and its row lock — and both roll the
 * whole verification back.
 */
export type StockCommitmentOutcome = 'COMMITTED' | 'ORDER_MOVED' | 'NO_ACTIVE_RESERVATION';

/**
 * The one non-money effect a verification may apply, provided by the module
 * that owns the order and its stock.
 *
 * A **port**, for the reason `BACKEND_CONVENTIONS.md` §10 gives and
 * `DEPOSIT_ELIGIBILITY_PORT` already demonstrates: Payment must not read or
 * write Ordering's and Inventory's tables. It declares the effect it needs and
 * the owning module supplies it, so the dependency points the way the module
 * boundary does.
 */
export interface VerifiedPaymentSettlementPort {
  /**
   * Turns the order's live inventory hold into a permanent commitment.
   *
   * Called **inside** the verification transaction, so the commitment and the
   * payment commit together or neither does.
   *
   * `expectedOrderStatus` is the source state the kind's LC-14 row named,
   * passed in rather than assumed: the implementation re-reads the order under
   * its own row lock and refuses if it moved, which is what makes this the
   * point at which a verification and the reservation-expiry sweep arbitrate.
   *
   * @requiresTransaction
   */
  commitReservedStock(input: {
    readonly orderId: string;
    readonly expectedOrderStatus: string;
    readonly adminId: string;
  }): Promise<StockCommitmentOutcome>;
}
