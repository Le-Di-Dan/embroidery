/**
 * The `REMAINING` bank-transfer reference (`APP7-G01` §4, delivered by `APP9-B02`).
 *
 * ```text
 * order code          ORD-XXXXXXXXXX          (uq_orders__code)
 * final-payment memo  ORDXXXXXXXXXXRM         15 characters, fixed
 * pattern             ^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}RM$
 * ```
 *
 * ### Not a second algorithm, and not a kind parameter either
 *
 * `APP7-G01` §4 froze one format — `ORD` + the ten-character order-code body +
 * a two-character kind code, parsed by **position** rather than by a delimiter —
 * and named both codes at once: `DC` for the deposit, `RM` reserved for this
 * obligation. So this is the same derivation with the kind code APP7 reserved,
 * not a competing scheme.
 *
 * It is a sibling module rather than a parameter on `depositTransferReference`
 * because that is what APP7 ruled: a kind parameter there would let the deposit
 * surface derive a memo for an obligation it does not make payable, and
 * `deposit-reference.spec.ts` asserts the function's arity to keep it that way.
 * The cost is four duplicated lines; the benefit is that neither surface can
 * address the other's obligation, which is exactly `CST-039`'s invariant
 * expressed in code.
 *
 * ### Derived, never persisted
 *
 * Both inputs — the order code and the obligation kind — are immutable, so the
 * same order yields the same memo on every read, every QR download, every retry
 * and every new attempt. Nothing stores it, so nothing can disagree with it, and
 * replay, idempotency and Admin reconciliation need no stored value.
 *
 * ### Distinguishable from the deposit, by construction
 *
 * The last two characters are the only difference, and they are the whole point:
 * an operator reconciling a bank statement, and `APP9-B03` after them, must be
 * able to tell which of one order's two obligations a transfer paid. A memo that
 * reused `DC` would make the two ambiguous on the only order where both are
 * live.
 */
import { HUMAN_CODE_ALPHABET, HUMAN_CODE_BODY_LENGTH } from '@embroidery/domain-types';

/** The prefix the order code carries, and the reference keeps. */
const ORDER_CODE_PREFIX = 'ORD';

/** `APP7-G01` §4 — the REMAINING obligation's kind code. */
export const REMAINING_REFERENCE_KIND_CODE = 'RM';

/** Exactly what {@link remainingTransferReference} produces, and nothing else. */
export const REMAINING_REFERENCE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}${REMAINING_REFERENCE_KIND_CODE}$`,
);

/** The order code this function accepts, checked rather than assumed. */
const ORDER_CODE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}-[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}$`,
);

/**
 * Derives the final-payment reference for one order code.
 *
 * Throws on a code that is not `ORD-` plus ten alphabet characters, for the
 * reason the deposit builder does: that is a repository invariant failure — the
 * code was drawn by `generateHumanCode` and stored under `uq_orders__code` — so
 * it is reported rather than coerced into a memo no bank statement would
 * reconcile.
 */
export function remainingTransferReference(orderCode: string): string {
  if (!ORDER_CODE_PATTERN.test(orderCode)) {
    throw new Error('An order code that is not ORD- plus ten code characters has no reference.');
  }
  return `${ORDER_CODE_PREFIX}${orderCode.slice(ORDER_CODE_PREFIX.length + 1)}${REMAINING_REFERENCE_KIND_CODE}`;
}
