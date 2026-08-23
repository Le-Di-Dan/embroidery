/**
 * The DEPOSIT bank-transfer reference (`APP7-G01` §4).
 *
 * ```text
 * order code        ORD-XXXXXXXXXX          (uq_orders__code)
 * deposit reference ORDXXXXXXXXXXDC         15 characters, fixed
 * pattern           ^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}DC$
 * ```
 *
 * ### Derived, never persisted
 *
 * Nothing stores it, so nothing can disagree with it. Both inputs — the order
 * code and the obligation kind — are immutable, so the same order yields the
 * same reference on every read, every retry and every new attempt, and replay,
 * idempotency and Admin reconciliation need no stored value.
 *
 * ### Why the hyphen goes
 *
 * Vietnamese banking apps normalise transfer memos inconsistently; a reference
 * that survives having its punctuation stripped is one that still reconciles.
 * The value is parsed by **position** — 3-character prefix, 10-character body,
 * 2-character kind — never by a delimiter.
 *
 * ### `RM` is reserved and not built
 *
 * `APP7-G01` §4 names `RM` for the remaining payment, which is APP9. This module
 * exports `DC` only: there is no kind parameter, because a parameter would be
 * the first step towards APP7 deriving a reference for an obligation it does not
 * make payable.
 */
import { HUMAN_CODE_ALPHABET, HUMAN_CODE_BODY_LENGTH } from '@embroidery/domain-types';

/** The prefix the order code carries, and the reference keeps. */
const ORDER_CODE_PREFIX = 'ORD';

/** `APP7-G01` §4 — the DEPOSIT obligation's kind code. */
export const DEPOSIT_REFERENCE_KIND_CODE = 'DC';

/** Exactly what {@link depositTransferReference} produces, and nothing else. */
export const DEPOSIT_REFERENCE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}${DEPOSIT_REFERENCE_KIND_CODE}$`,
);

/** The order code this function accepts, checked rather than assumed. */
const ORDER_CODE_PATTERN = new RegExp(
  `^${ORDER_CODE_PREFIX}-[${HUMAN_CODE_ALPHABET}]{${String(HUMAN_CODE_BODY_LENGTH)}}$`,
);

/**
 * Derives the deposit reference for one order code.
 *
 * Throws on a code that is not `ORD-` plus ten alphabet characters. That is a
 * repository invariant failure rather than a customer input problem — the code
 * was drawn by `generateHumanCode` and stored under `uq_orders__code` — so it is
 * reported instead of being coerced into a 13-character reference no bank memo
 * would reconcile.
 */
export function depositTransferReference(orderCode: string): string {
  if (!ORDER_CODE_PATTERN.test(orderCode)) {
    throw new Error('An order code that is not ORD- plus ten code characters has no reference.');
  }
  return `${ORDER_CODE_PREFIX}${orderCode.slice(ORDER_CODE_PREFIX.length + 1)}${DEPOSIT_REFERENCE_KIND_CODE}`;
}
