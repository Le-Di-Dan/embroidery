/**
 * The seven payment strings that are **not** the same on both order origins.
 *
 * ## Why this exists
 *
 * `APP12-A02-C1` reused the delivered APP7 payment workbench for Ready-Made,
 * which was right: the expected/observed comparison, the two decisions, the
 * lost-response recovery and the supporting-only evidence semantics are the same
 * behaviour against a different obligation kind. What came with the components
 * was their vocabulary, and a Ready-Made order has no deposit.
 *
 * `V01-UX-006` measured the result on a live `FULL` obligation: the dialog was
 * titled "Xác nhận đã nhận **tiền cọc**", the expected figure was labelled "Số
 * tiền **cọc** kỳ vọng", the submit button repeated it, the settled
 * announcement repeated it again, and the evidence empty state told the operator
 * they could confirm a deposit without a photo — on the same screen that
 * elsewhere states the order has no deposit at all. Five strings and one
 * self-contradiction, on the operation that settles money.
 *
 * ## The branch is explicit, and it is the server's `origin`
 *
 * `APP12-V02` §24 requires it: the caller passes the order's own `origin` and
 * gets the matching set. Nothing here infers the branch from the obligation
 * kind, from a missing `customRequestId`, from the status or from the presence
 * of a quotation — those are commercial inferences the client does not get to
 * make, and `APP12-A02-C1` already established that `origin` is the only
 * authority for this distinction.
 *
 * ## Only vocabulary lives here
 *
 * No amount, no rule, no eligibility and no state. The two branches say the same
 * things about the same operation in the words that are true of each; §24 is
 * explicit that custom-origin deposit terminology is unchanged, and it is —
 * `CUSTOM` holds exactly the strings APP7 shipped.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `paymentTerminology`),
 * not in this file (`APP12-V02` §5A).
 */
const custom = messageView(VI_MESSAGES.adminOrders, 'paymentTerminology.CUSTOM');
const readyMade = messageView(VI_MESSAGES.adminOrders, 'paymentTerminology.READY_MADE');

export interface PaymentTerminology {
  /** The verification dialog's own heading. */
  readonly dialogTitle: string;
  /** The label above the server's frozen expected figure. */
  readonly expectedAmount: string;
  /** The submit control, when no decision has been recorded yet. */
  readonly submit: string;
  /** The submit control, when an earlier decision is being reopened. */
  readonly reopenSubmit: string;
  /** What the panel says once the obligation is satisfied. */
  readonly settledNote: string;
  /** The evidence list with nothing in it — a normal state, not a failure. */
  readonly evidenceEmptyBody: string;
  /** A rejected photo is not a failed payment; the branch says so in its words. */
  readonly evidenceRejectedNote: string;
}

const CUSTOM_TERMS: PaymentTerminology = {
  dialogTitle: custom.text('dialogTitle'),
  expectedAmount: custom.text('expectedAmount'),
  submit: custom.text('submit'),
  reopenSubmit: custom.text('reopenSubmit'),
  settledNote: custom.text('settledNote'),
  evidenceEmptyBody: custom.text('evidenceEmptyBody'),
  evidenceRejectedNote: custom.text('evidenceRejectedNote'),
};

const READY_MADE_TERMS: PaymentTerminology = {
  dialogTitle: readyMade.text('dialogTitle'),
  expectedAmount: readyMade.text('expectedAmount'),
  submit: readyMade.text('submit'),
  reopenSubmit: readyMade.text('reopenSubmit'),
  settledNote: readyMade.text('settledNote'),
  evidenceEmptyBody: readyMade.text('evidenceEmptyBody'),
  evidenceRejectedNote: readyMade.text('evidenceRejectedNote'),
};

/**
 * The vocabulary for one order's origin.
 *
 * `string` rather than the generated enum: the contract publishes `READY_MADE`
 * and `CUSTOM`, and an origin this build has never heard of must fall to the
 * deposit wording APP7 shipped rather than crash a payment screen. A third
 * origin arriving is a contract change that gets its own branch, not a default.
 */
export function paymentTerminologyFor(origin: string): PaymentTerminology {
  return origin === 'READY_MADE' ? READY_MADE_TERMS : CUSTOM_TERMS;
}
