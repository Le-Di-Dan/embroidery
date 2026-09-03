/**
 * Which attempt the reconciliation controls act on (`734:155`, `741:43`,
 * `741:114`).
 *
 * `APP7-B04` addresses both decisions by `attemptId`, so the screen has to name
 * one. It names the **newest attempt still open**, and only while the deposit
 * obligation itself is unsatisfied.
 *
 * ## This is not a lifecycle authority
 *
 * The server refuses a decision against a terminal attempt — LC-16 never
 * regresses — and it would refuse one against a satisfied obligation. Nothing
 * here changes that: this picks which of several attempts a control should
 * address, and hides the control where the design hides it. A refusal is still
 * the server's to issue, and the screen re-reads and shows the current truth
 * when it arrives.
 *
 * ## Open, stated positively
 *
 * The two open states are named rather than the terminal ones excluded. APP7
 * produces exactly `PENDING` and `REQUIRES_REVIEW`; the contract's other six
 * values are states APP7 neither creates nor owns a screen for (`751:174`), and
 * offering a money-moving control against a `PROCESSING` or `REFUNDED` attempt
 * on the strength of "it is not in my terminal list" would be this screen
 * guessing at a lifecycle it does not own. An unrecognised status is not open.
 *
 * `741:114` is the other half: once the result is `SUCCEEDED` / `DEPOSIT_PAID`,
 * the verification action is hidden — the work is done, even if it was another
 * operator who did it.
 */
import type {
  AdminOrderPaymentsResponse,
  AdminPaymentAttemptResponse,
} from '@embroidery/api-client';

const OPEN_ATTEMPT_STATUSES: readonly string[] = ['PENDING', 'REQUIRES_REVIEW'];

const OBLIGATION_PENDING = 'PENDING';

export function isOpenAttempt(attempt: AdminPaymentAttemptResponse): boolean {
  return OPEN_ATTEMPT_STATUSES.includes(attempt.status);
}

/**
 * The attempt the controls address, or `undefined` when there is none to act on.
 *
 * The read returns attempts oldest first, so the newest open one is the last
 * match rather than the first. The obligation gate is checked first: on a
 * satisfied obligation there is nothing to reconcile whatever the attempts say.
 *
 * ## It reads the **current** obligation, whichever kind that is
 *
 * `APP12-A02-C1` replaced the flat `depositStatus` with `currentObligation`,
 * and this function follows it unchanged in meaning: a `DEPOSIT` on a custom
 * order, a `FULL` on a Ready-Made one. Two properties come free with that.
 *
 * An **absent** obligation — a Ready-Made order still awaiting its shipping fee
 * — yields no actionable attempt, which is correct: there is no money to
 * reconcile before there is anything to pay.
 *
 * And because the read lists attempts from the *live* obligation's own id, an
 * attempt against a predecessor superseded by a shipping-fee correction is
 * never in `payments.attempts` to be selected. The isolation is the contract's,
 * not a filter this screen would have to remember to apply.
 */
export function selectActionableAttempt(
  payments: AdminOrderPaymentsResponse,
): AdminPaymentAttemptResponse | undefined {
  if (payments.currentObligation?.status !== OBLIGATION_PENDING) {
    return undefined;
  }
  return payments.attempts.filter(isOpenAttempt).at(-1);
}
