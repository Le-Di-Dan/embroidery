/**
 * Which verified obligation kind reserves inventory (`APP9-W01` §4, §6, §7).
 *
 * One function, deliberately, and deliberately *not* inside the parser. The
 * parser answers "is this a well-formed `payment.verified` row"; this answers
 * "does a well-formed one require inventory work". Keeping them apart is what
 * makes the REMAINING no-op reviewable as a decision rather than as an absence:
 * a reader can see the branch, and a future kind cannot slip through it — an
 * unknown kind never reaches here, because the parser has already refused it.
 *
 * `TR-LC17-04` gates the official reservation on **the deposit**. A remaining
 * payment is the customer settling the balance of an order whose stock was
 * committed the moment the deposit was verified; reserving again would commit a
 * second set against the same order. So the answer for `REMAINING` is not "do
 * something smaller" — it is "there is nothing inventory owes this event", which
 * is a successful consumption, not a failure and not a skipped one.
 *
 * `FULL` (`APP12-H03-C1`) is the same answer reached from the opposite
 * direction. Custom commerce reserves *after* its deposit is verified, which is
 * why this handler exists; Ready-Made reserves at checkout and **consumes**
 * inside the verifying transaction itself (`APP12-B05`, `COMMIT_RESERVED_STOCK`
 * → `CommitReadyMadeStockService`). The units have already left on-hand and the
 * reservation is already `CONSUMED` before this event is claimable, so
 * reserving here would create a second hold against goods that are sold, and
 * consuming here would decrement on-hand twice.
 *
 * A `switch` over the closed union rather than `kind === DEPOSIT`, so that
 * adding a fourth kind to `VERIFIED_OBLIGATION_KINDS` is a compile error here
 * instead of a silent no-op in production. That is exactly how the third one was
 * caught: the compiler refused the set change until this file answered for it.
 */
import {
  DEPOSIT_OBLIGATION_KIND,
  FULL_OBLIGATION_KIND,
  REMAINING_OBLIGATION_KIND,
  type VerifiedObligationKind,
} from './payment-verified.payload';

export function requiresInventoryReservation(kind: VerifiedObligationKind): boolean {
  switch (kind) {
    case DEPOSIT_OBLIGATION_KIND:
      return true;
    case REMAINING_OBLIGATION_KIND:
      return false;
    case FULL_OBLIGATION_KIND:
      return false;
  }
}
