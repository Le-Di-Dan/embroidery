/**
 * Every operator-facing string on the Ready-Made order branch (`913:337`,
 * `914:361`).
 *
 * A catalog of its own beside `order-detail-copy.ts`, not an extension of it:
 * the two branches say different things about different commerce, and one file
 * holding both would make it easy to reach for a deposit sentence on a
 * Ready-Made screen. Status and origin **labels** are in neither — they belong
 * to `shared/presentation/`, because an order must not be named one thing in
 * the list and another on the screen it opens.
 *
 * The refusal sentences are chosen by failure *classification* alone. A server
 * `message`, `code` or `requestId` is never rendered.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `readyMadeDetail`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const readyMadeDetailMessage = messageView(VI_MESSAGES.adminOrders, 'readyMadeDetail');

export const READY_MADE_DETAIL_COPY = {
  frozen: {
    heading: readyMadeDetailMessage.text('frozen.heading'),
    help: readyMadeDetailMessage.text('frozen.help'),
    origin: readyMadeDetailMessage.text('frozen.origin'),
    code: readyMadeDetailMessage.text('frozen.code'),
    customer: readyMadeDetailMessage.text('frozen.customer'),
    contact: readyMadeDetailMessage.text('frozen.contact'),
    address: readyMadeDetailMessage.text('frozen.address'),
    createdAt: readyMadeDetailMessage.text('frozen.createdAt'),
    /** The reservation's own committed `expires_at`, never a computed window. */
    paymentDeadline: readyMadeDetailMessage.text('frozen.paymentDeadline'),
    /** Shown where the hold has lapsed, been released or been consumed. */
    paymentDeadlineAbsent: readyMadeDetailMessage.text('frozen.paymentDeadlineAbsent'),
    /** `BR-031` — the omission is stated, not left as an empty card. */
    /** Before the fee is confirmed there is no payable total to name. */
    totalUnknown: readyMadeDetailMessage.text('frozen.totalUnknown'),
  },
  items: {
    heading: readyMadeDetailMessage.text('items.heading'),
    product: readyMadeDetailMessage.text('items.product'),
    sku: readyMadeDetailMessage.text('items.sku'),
    quantity: readyMadeDetailMessage.text('items.quantity'),
    unitPrice: readyMadeDetailMessage.text('items.unitPrice'),
    help: readyMadeDetailMessage.text('items.help'),
  },
  shipping: {
    heading: readyMadeDetailMessage.text('shipping.heading'),
    help: readyMadeDetailMessage.text('shipping.help'),
    feeLabel: readyMadeDetailMessage.text('shipping.feeLabel'),
    feePlaceholder: readyMadeDetailMessage.text('shipping.feePlaceholder'),
    requiredLabel: readyMadeDetailMessage.text('shipping.requiredLabel'),
    /** `NULL` is unpriced and `0` is free delivery — two different facts. */
    feeHelp: readyMadeDetailMessage.text('shipping.feeHelp'),
    merchandise: readyMadeDetailMessage.text('shipping.merchandise'),
    payable: readyMadeDetailMessage.text('shipping.payable'),
    /** Nothing is payable until the operator confirms a fee (`BR-029`). */
    payableUnknown: readyMadeDetailMessage.text('shipping.payableUnknown'),
    confirm: readyMadeDetailMessage.text('shipping.confirm'),
    confirmNote: readyMadeDetailMessage.text('shipping.confirmNote'),
    correct: readyMadeDetailMessage.text('shipping.correct'),
    /**
     * The successor warning (`914:361`). It says the predecessor is replaced and
     * deliberately does **not** say the payment window is extended — the server
     * reschedules the stock hold, which is a different fact, and claiming a
     * longer time to pay would be this screen inventing a deadline.
     */
    correctWarning: readyMadeDetailMessage.text('shipping.correctWarning'),
    saving: readyMadeDetailMessage.text('shipping.saving'),
    frozenHeading: readyMadeDetailMessage.text('shipping.frozenHeading'),
    /** `BR-028` — the rule and the legitimate path, never a silent disable. */
    refusedTitle: readyMadeDetailMessage.text('shipping.refusedTitle'),
    refusedBody: readyMadeDetailMessage.text('shipping.refusedBody'),
    pendingNote: readyMadeDetailMessage.text('shipping.pendingNote'),
  },
  payment: {
    heading: readyMadeDetailMessage.text('payment.heading'),
    /** The one obligation a Ready-Made order carries (`BR-029`). */
    note: readyMadeDetailMessage.text('payment.note'),
    emptyBody: readyMadeDetailMessage.text('payment.emptyBody'),
    amount: readyMadeDetailMessage.text('payment.amount'),
    status: readyMadeDetailMessage.text('payment.status'),
    reference: readyMadeDetailMessage.text('payment.reference'),
    attemptHeading: readyMadeDetailMessage.text('payment.attemptHeading'),
    attemptStatus: readyMadeDetailMessage.text('payment.attemptStatus'),
    attemptAmount: readyMadeDetailMessage.text('payment.attemptAmount'),
    evidence: readyMadeDetailMessage.text('payment.evidence'),
    evidenceCount: (count: number) =>
      readyMadeDetailMessage.text('payment.evidenceCount', { count }),
    noAttempt: readyMadeDetailMessage.text('payment.noAttempt'),
    /** Evidence is supporting material and never a payment fact. */
    evidenceNote: readyMadeDetailMessage.text('payment.evidenceNote'),
    verify: readyMadeDetailMessage.text('payment.verify'),
    settled: readyMadeDetailMessage.text('payment.settled'),
  },
  fulfillment: {
    heading: readyMadeDetailMessage.text('fulfillment.heading'),
    /** `913:337` — the precondition, stated rather than left as an empty column. */
    lockedHelp: readyMadeDetailMessage.text('fulfillment.lockedHelp'),
  },
  failure: {
    loading: readyMadeDetailMessage.text('failure.loading'),
    unavailableTitle: readyMadeDetailMessage.text('failure.unavailableTitle'),
    unavailableBody: readyMadeDetailMessage.text('failure.unavailableBody'),
    retry: readyMadeDetailMessage.text('failure.retry'),
    saveFailed: readyMadeDetailMessage.text('failure.saveFailed'),
    stale: readyMadeDetailMessage.text('failure.stale'),
  },
} as const;
