/**
 * Every operator-facing string the APP9 commerce-completion workspace renders
 * (`809:4`, `809:95`, `811:4`, `812:4`, `812:109`, `814:4`, `815:4`, `815:89`,
 * `815:124`, and the refusal catalog `820:47`).
 *
 * A second catalog beside `order-detail-copy.ts` rather than an addition to it:
 * the APP7 deposit workbench and the APP9 fulfillment rail are different
 * capabilities on one screen, they were approved by different design packages,
 * and a single object holding both would be reviewed as neither.
 *
 * ## Two vocabularies never reach this file
 *
 * **Transport names.** `PaymentDecisionResponse.depositObligationId` and
 * `.depositStatus` carry the **REMAINING** obligation on a balance verification
 * (`FU-APP9-B03-01`). They are wire spellings, not words: the screen says
 * "Thanh toán còn lại" and "Trạng thái thanh toán", and `811:88` requires it in
 * so many terms.
 *
 * **Database terms.** No `shipping_snapshots`, no `payment_obligations`, no
 * SQLSTATE and no constraint name appears in primary copy. The dispatch dialog
 * says the detail is frozen and photographed, which is what an operator needs
 * to decide; the table it is written to is not their business.
 *
 * ## The refusal sentences are chosen by classification, never by server text
 *
 * A `message`, `code` or `requestId` from the server is never rendered. Each
 * sentence below is the approved product copy for one classified outcome, so a
 * backend wording change cannot leak an English stack sentence onto a
 * Vietnamese screen.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `fulfillment`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const fulfillmentMessage = messageView(VI_MESSAGES.adminOrders, 'fulfillment');

export const ORDER_FULFILLMENT_COPY = {
  finalPayment: {
    title: fulfillmentMessage.text('finalPayment.title'),
    readyHelp: fulfillmentMessage.text('finalPayment.readyHelp'),
    openAction: fulfillmentMessage.text('finalPayment.openAction'),
    openNote: fulfillmentMessage.text('finalPayment.openNote'),
    awaitingBadge: fulfillmentMessage.text('finalPayment.awaitingBadge'),
    awaitingHelp: fulfillmentMessage.text('finalPayment.awaitingHelp'),
  },
  openDialog: {
    title: fulfillmentMessage.text('openDialog.title'),
    body: fulfillmentMessage.text('openDialog.body'),
    effectLabel: fulfillmentMessage.text('openDialog.effectLabel'),
    effectValue: fulfillmentMessage.text('openDialog.effectValue'),
    effectNote: fulfillmentMessage.text('openDialog.effectNote'),
    confirm: fulfillmentMessage.text('openDialog.confirm'),
    cancel: fulfillmentMessage.text('openDialog.cancel'),
    pending: fulfillmentMessage.text('openDialog.pending'),
  },
  /**
   * The named API gap, drawn rather than hidden (`811:74`).
   *
   * `FU-APP9-B03-02`: no Admin read projects the REMAINING obligation, so the
   * balance, its attempts, its evidence and its reconciliations are all
   * unreadable here. The last sentence is the one that matters — the screen must
   * never subtract the deposit from the total, because a shipping-fee increase
   * supersedes the obligation and falsifies that arithmetic.
   */
  apiGap: {
    title: fulfillmentMessage.text('apiGap.title'),
    body: fulfillmentMessage.text('apiGap.body'),
  },
  verification: {
    title: fulfillmentMessage.text('verification.title'),
    help: fulfillmentMessage.text('verification.help'),
    unavailable: fulfillmentMessage.text('verification.unavailable'),
  },
  shipping: {
    title: fulfillmentMessage.text('shipping.title'),
    editableBadge: fulfillmentMessage.text('shipping.editableBadge'),
    frozenBadge: fulfillmentMessage.text('shipping.frozenBadge'),
    editableHelp: fulfillmentMessage.text('shipping.editableHelp'),
    frozenHelp: fulfillmentMessage.text('shipping.frozenHelp'),
    requiredNote: fulfillmentMessage.text('shipping.requiredNote'),
    save: fulfillmentMessage.text('shipping.save'),
    reset: fulfillmentMessage.text('shipping.reset'),
    saving: fulfillmentMessage.text('shipping.saving'),
    saved: fulfillmentMessage.text('shipping.saved'),
    missing: fulfillmentMessage.text('shipping.missing'),
    noTracking: fulfillmentMessage.text('shipping.noTracking'),
  },
  shippingFields: {
    recipientName: fulfillmentMessage.text('shippingFields.recipientName'),
    recipientPhone: fulfillmentMessage.text('shippingFields.recipientPhone'),
    addressLine: fulfillmentMessage.text('shippingFields.addressLine'),
    ward: fulfillmentMessage.text('shippingFields.ward'),
    district: fulfillmentMessage.text('shippingFields.district'),
    province: fulfillmentMessage.text('shippingFields.province'),
    feeAmount: fulfillmentMessage.text('shippingFields.feeAmount'),
    carrierName: fulfillmentMessage.text('shippingFields.carrierName'),
    trackingCode: fulfillmentMessage.text('shippingFields.trackingCode'),
    frozenAt: fulfillmentMessage.text('shippingFields.frozenAt'),
  },
  shippingFee: {
    title: fulfillmentMessage.text('shippingFee.title'),
    currentLabel: fulfillmentMessage.text('shippingFee.currentLabel'),
    ruleTitle: fulfillmentMessage.text('shippingFee.ruleTitle'),
    ruleBody: fulfillmentMessage.text('shippingFee.ruleBody'),
    unsetValue: fulfillmentMessage.text('shippingFee.unsetValue'),
  },
  /**
   * The fee-increase refusal (`812:109`), and the one card in this catalog whose
   * *absences* are as approved as its text.
   *
   * `APP9-B04-C1` is the authority: an Admin write may never mint the customer's
   * acknowledgement. So there is no "confirm on the customer's behalf" label
   * here, no field for a fee the operator claims the customer agreed to, and
   * nothing that names a grant, a challenge or a secure link — a screen that
   * showed one would be publishing the state of a customer's credential to an
   * operator who has no use for it.
   */
  feeRefusal: {
    title: fulfillmentMessage.text('feeRefusal.title'),
    body: fulfillmentMessage.text('feeRefusal.body'),
    acknowledgedLabel: fulfillmentMessage.text('feeRefusal.acknowledgedLabel'),
    attemptedLabel: fulfillmentMessage.text('feeRefusal.attemptedLabel'),
    nothingWritten: fulfillmentMessage.text('feeRefusal.nothingWritten'),
    remedy: fulfillmentMessage.text('feeRefusal.remedy'),
    noOverrideTitle: fulfillmentMessage.text('feeRefusal.noOverrideTitle'),
    noOverrideBody: fulfillmentMessage.text('feeRefusal.noOverrideBody'),
    restore: fulfillmentMessage.text('feeRefusal.restore'),
  },
  dispatch: {
    title: fulfillmentMessage.text('dispatch.title'),
    help: fulfillmentMessage.text('dispatch.help'),
    action: fulfillmentMessage.text('dispatch.action'),
    blockedNote: fulfillmentMessage.text('dispatch.blockedNote'),
    dialogTitle: fulfillmentMessage.text('dispatch.dialogTitle'),
    dialogBody: fulfillmentMessage.text('dispatch.dialogBody'),
    freezeTitle: fulfillmentMessage.text('dispatch.freezeTitle'),
    freezeBody: fulfillmentMessage.text('dispatch.freezeBody'),
    snapshotTitle: fulfillmentMessage.text('dispatch.snapshotTitle'),
    confirm: fulfillmentMessage.text('dispatch.confirm'),
    cancel: fulfillmentMessage.text('dispatch.cancel'),
    pending: fulfillmentMessage.text('dispatch.pending'),
  },
  completion: {
    title: fulfillmentMessage.text('completion.title'),
    help: fulfillmentMessage.text('completion.help'),
    action: fulfillmentMessage.text('completion.action'),
    deliveredAtLabel: fulfillmentMessage.text('completion.deliveredAtLabel'),
    dialogTitle: fulfillmentMessage.text('completion.dialogTitle'),
    dialogBody: fulfillmentMessage.text('completion.dialogBody'),
    effectLabel: fulfillmentMessage.text('completion.effectLabel'),
    effectValue: fulfillmentMessage.text('completion.effectValue'),
    effectNote: fulfillmentMessage.text('completion.effectNote'),
    confirm: fulfillmentMessage.text('completion.confirm'),
    cancel: fulfillmentMessage.text('completion.cancel'),
    pending: fulfillmentMessage.text('completion.pending'),
  },
  completed: {
    title: fulfillmentMessage.text('completed.title'),
    noActionsTitle: fulfillmentMessage.text('completed.noActionsTitle'),
    noActions: fulfillmentMessage.list('completed.noActions'),
    deferred: fulfillmentMessage.text('completed.deferred'),
  },
  payment: {
    title: fulfillmentMessage.text('payment.title'),
    depositSettled: fulfillmentMessage.text('payment.depositSettled'),
    remainingSettled: fulfillmentMessage.text('payment.remainingSettled'),
    settledNote: fulfillmentMessage.text('payment.settledNote'),
  },
  locked: {
    title: fulfillmentMessage.text('locked.title'),
    shipping: fulfillmentMessage.text('locked.shipping'),
    shippingWhy: fulfillmentMessage.text('locked.shippingWhy'),
    dispatch: fulfillmentMessage.text('locked.dispatch'),
    dispatchWhy: fulfillmentMessage.text('locked.dispatchWhy'),
    completion: fulfillmentMessage.text('locked.completion'),
    completionWhy: fulfillmentMessage.text('locked.completionWhy'),
  },
  /** One sentence per classified refusal — the `820:47` catalog. */
  refusal: {
    transitionStale: fulfillmentMessage.text('refusal.transitionStale'),
    shippingMissing: fulfillmentMessage.text('refusal.shippingMissing'),
    shippingIncomplete: fulfillmentMessage.text('refusal.shippingIncomplete'),
    shippingFrozen: fulfillmentMessage.text('refusal.shippingFrozen'),
    feeChangeUnavailable: fulfillmentMessage.text('refusal.feeChangeUnavailable'),
    feeNotApplicable: fulfillmentMessage.text('refusal.feeNotApplicable'),
    remainingMissing: fulfillmentMessage.text('refusal.remainingMissing'),
    dispatchPaymentGuard: fulfillmentMessage.text('refusal.dispatchPaymentGuard'),
    dispatchShippingNotReady: fulfillmentMessage.text('refusal.dispatchShippingNotReady'),
    dispatchInvalid: fulfillmentMessage.text('refusal.dispatchInvalid'),
    completionInvalid: fulfillmentMessage.text('refusal.completionInvalid'),
    notFound: fulfillmentMessage.text('refusal.notFound'),
    unauthenticated: fulfillmentMessage.text('refusal.unauthenticated'),
    generic: fulfillmentMessage.text('refusal.generic'),
  },
  failure: {
    loading: fulfillmentMessage.text('failure.loading'),
    retry: fulfillmentMessage.text('failure.retry'),
  },
} as const;
