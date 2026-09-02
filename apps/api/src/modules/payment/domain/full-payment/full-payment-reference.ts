/**
 * The `FULL` bank-transfer reference (`APP7-G01` §4, delivered by `APP12-B04`).
 *
 * ```text
 * order code         ORD-XXXXXXXXXX          (uq_orders__code)
 * full-payment memo  ORDXXXXXXXXXXFL         15 characters, fixed
 * pattern            ^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}FL$
 * ```
 *
 * ### The frozen format, with the third kind code
 *
 * `APP7-G01` §4 froze one shape — `ORD` + the ten-character order-code body +
 * a two-character kind code, parsed by **position** rather than by a delimiter
 * — and named `DC` for the deposit and `RM` for the remaining balance. `FL` is
 * this checkpoint's addition to that vocabulary and changes nothing else: the
 * length, the alphabet, the prefix, the positional parse and the
 * `^[A-Z0-9]{15}$` EMVCo-safe character rule are the delivered ones, so an
 * operator's reconciliation and the QR encoder both keep working unmodified.
 *
 * A Ready-Made order has exactly one obligation, so `FL` and `DC`/`RM` can
 * never appear on the same order — `ck_payment_obligations__kind_by_origin`
 * makes the kinds mutually exclusive by origin. The distinct code still earns
 * its place: an operator reconciling a bank statement across the whole shop
 * must be able to tell a Ready-Made transfer from a custom deposit without
 * looking the order up first.
 *
 * ### A sibling module, not a kind parameter
 *
 * `APP7-G01` §4 forbids a kind parameter on `depositTransferReference`, because
 * a builder that can derive another kind's memo lets one surface address an
 * obligation it does not make payable — and `deposit-reference.spec.ts` asserts
 * that function's arity to keep it that way. `APP9-B02` accepted the same four
 * duplicated lines for `RM`; this is the third instance of the same trade, and
 * the benefit is unchanged: the deposit surface, the final-payment surface and
 * this one structurally cannot mint each other's memos.
 *
 * ### Derived, never persisted
 *
 * Both inputs — the order code and the obligation kind — are immutable, so the
 * same order yields the same memo on every read, every QR download, every retry
 * and every new attempt, **including across a shipping-fee supersession**: the
 * successor `FULL` obligation carries a different amount but the same memo,
 * because the memo names the order rather than the obligation. That is what
 * lets an operator reconcile a transfer that was sent before a fee correction.
 * Nothing stores it, so nothing can disagree with it.
 */
import { HUMAN_CODE_ALPHABET, HUMAN_CODE_BODY_LENGTH } from '@embroidery/domain-types';

/** The prefix the order code carries, and the reference keeps. */
const ORDER_CODE_PREFIX = 'ORD';

/** `APP7-G01` §4 — the FULL obligation's kind code, added by `APP12-B04`. */
export const FULL_REFERENCE_KIND_CODE = 'FL';

/** Exactly what {@link fullTransferReference} produces, and nothing else. */
export const FULL_REFERENCE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}${FULL_REFERENCE_KIND_CODE}$`,
);

/** The order code this function accepts, checked rather than assumed. */
const ORDER_CODE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}-[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}$`,
);

/**
 * Derives the full-payment reference for one order code.
 *
 * Throws on a code that is not `ORD-` plus ten alphabet characters, for the
 * reason the deposit and remaining builders do: that is a repository invariant
 * failure — the code was drawn by `generateOrderCode` and stored under
 * `uq_orders__code` — so it is reported rather than coerced into a memo no bank
 * statement would reconcile.
 */
export function fullTransferReference(orderCode: string): string {
  if (!ORDER_CODE_PATTERN.test(orderCode)) {
    throw new Error('An order code that is not ORD- plus ten code characters has no reference.');
  }
  return `${ORDER_CODE_PREFIX}${orderCode.slice(ORDER_CODE_PREFIX.length + 1)}${FULL_REFERENCE_KIND_CODE}`;
}
