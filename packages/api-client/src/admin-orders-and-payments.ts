/**
 * The **Admin** half of an order and the money against it: the order queue and
 * detail, the payment vertical and its two decisions, private evidence
 * delivery (`APP7-B02`, `APP7-B04`, `APP7-B06`), and the commerce-completion
 * operations (`APP9-B01`, `APP9-B04`, `APP9-B05`).
 *
 * Split from `orders-and-payments.ts` by `APP12-A02-C1`, on the boundary that
 * was already the file's internal structure: every operation here is behind
 * `AuthenticatedAdminGuard` and is consumed by the Admin app, and every one
 * left there is a customer surface authorized by a secure-link token. The two
 * halves have different callers, different auth and different rules about what
 * may be said, and keeping them apart is what stops a customer command being
 * reached from an operator screen by an import that looked plausible.
 *
 * ## Every amount crosses as a `string`
 *
 * Order totals, line figures, obligation amounts, attempt amounts, observed
 * amounts and shipping fees are all decimal strings. A VND amount through an
 * IEEE-754 double is precision loss no later formatting can undo, and no
 * consumer of this barrel may turn one into a number.
 *
 * ## `publicOrderShippingFee_acknowledge` is deliberately absent
 *
 * It is a **customer** command. An Admin write may never mint the customer's
 * acknowledgement of a higher shipping fee (`APP9-B04-C1`), and keeping the
 * operation off this boundary is what makes that a matter of what is in scope
 * rather than of self-discipline.
 */
// The Admin order + deposit-payment workspace (`APP7-B02` order reads,
// `APP7-B04` payment read and the two decisions, `APP7-B06` private evidence
// delivery), consumed by `APP7-A01`.
//
// Six operations, released consumer-driven. `APP7-B06` deliberately left its
// curated export to this checkpoint rather than publishing a byte-serving
// operation with no screen behind it, on the delivered `APP5-B06` → `APP5-A02`
// precedent; `B02` and `B04` cross here for the same reason.
//
// ### The two decisions cross for the first time
//
// `adminPaymentAttemptVerify` is the only operation in APP7 that can move money
// state, and `adminPaymentAttemptReview` is the only one that can suspend an
// attempt for reconciliation. Until A01 there was no approved control behind
// either. They travel with the reads on purpose: a decision is only legible
// beside the expected/observed facts it is judged against, and A01 re-reads
// `adminOrderPaymentRead` after every one of them rather than projecting the
// receipt into the cache.
//
// ### `adminPaymentEvidenceGet` is addressed by `evidenceId`
//
// The locator is the `payment_transfer_evidence` association id, never an asset
// id — there is no route that serves an asset by its own id, and `APP7-B04`
// publishes no `assetId` for one to be lifted from. The operation returns a
// `Blob`; the generated function sets `responseType: 'blob'` itself, so no
// consumer configures transport to get it.
//
// ### Every amount crosses as a `string`
//
// `expectedAmount`, an attempt's `amount`, a reconciliation's `amount`, the
// order total and every order-item figure are decimal strings. A VND amount
// through an IEEE-754 double is precision loss no later formatting can undo, and
// the verify body's `observedAmount` is a string for the same reason — the
// server compares it exactly, with no tolerance and no rounding.
//
// The status enums cross as **values** so the screen derives its labels and its
// action matrix from the contract rather than from a hand-kept list that could
// drift from what the server publishes. `AdminOrderListStatusItem` in
// particular is what the queue's filter options are built from.
//
// `AdminPaymentAttemptResponseStatus` publishes the full LC-16 vocabulary,
// `PROCESSING`, `REFUNDED` and `PARTIALLY_REFUNDED` included, because a stored
// attempt may carry one and the panel renders what is stored — APP7 itself
// produces none of them.
//
// ### `APP12-A02-C1` widened all three reads, and added no operation
//
// The same six operations cross; what changed is what they answer for a
// Ready-Made order. `origin` is now published on the queue item, the detail and
// the payment read, and it is the **only** discriminator a consumer may branch
// on: `AdminOrderQueueItemResponseOrigin`, `AdminOrderDetailResponseOrigin` and
// `AdminOrderPaymentsResponseOrigin` therefore cross as **values**, so a screen
// compares against the contract rather than a string literal that would compile
// just as well misspelled.
//
// The custom-chain members — `customRequestId`, `acceptedQuotationVersionId`,
// `currentApprovalSnapshotId` and each item's `approvalSnapshotId` — are now
// optional, because `ck_orders__custom_chain_by_origin` nulls all four on a
// `READY_MADE` row. A consumer narrows them **by origin**, never the reverse: a
// missing `customRequestId` is a consequence of the discriminator, not a
// substitute for reading it.
//
// `AdminOrderListParams.origin` is the server-side filter. A consumer must not
// fetch pages and filter rows itself — the keyset cursor pages over the
// *filtered* set, so local filtering would produce short pages and skipped rows.
//
// ### `currentObligation` is the payment authority, and it may be absent
//
// `adminOrderPaymentRead` no longer answers only for a DEPOSIT. It publishes the
// live obligation of whichever kind the order's origin collects — `DEPOSIT` for
// `CUSTOM`, `FULL` for `READY_MADE` — as `currentObligation`, carrying the
// obligation's own frozen `expectedAmount`, its `expectedTransferReference`
// (the `…DC` or `…FL` memo the customer was actually given) and the `attempts`
// listed from that obligation's own id.
//
// It is **absent** exactly when a Ready-Made order is still at
// `AWAITING_SHIPPING_FEE` and has no `FULL` obligation yet (`BR-029`). That is
// an unpriced order, not a missing one, and a consumer must render it as
// "not priced yet" rather than as an error — the Admin detail is opened in that
// state routinely.
//
// Only the **live** obligation crosses, so the predecessor a shipping-fee
// correction superseded never appears and its attempts are never listed as the
// successor's. A consumer must not try to tell the two apart by transfer
// reference: a correction leaves the memo unchanged, because it derives from the
// order code, so both obligations carry the same one.
export {
  adminOrderList,
  adminOrderDetail,
  adminOrderPaymentRead,
  adminPaymentAttemptVerify,
  adminPaymentAttemptReview,
  adminPaymentEvidenceGet,
} from './generated/embroidery-api';
export {
  AdminOrderListStatusItem,
  AdminOrderListOriginItem,
  AdminOrderQueueItemResponseStatus,
  AdminOrderQueueItemResponseOrigin,
  AdminOrderDetailResponseStatus,
  AdminOrderDetailResponseOrigin,
  AdminOrderItemResponseSubjectKind,
  AdminOrderPaymentsResponseOrderStatus,
  AdminOrderPaymentsResponseOrigin,
  AdminPaymentObligationResponseKind,
  AdminPaymentObligationResponseStatus,
  AdminPaymentAttemptResponseStatus,
  AdminPaymentAttemptResponseMethod,
  AdminPaymentEvidenceResponseAssetStatus,
  AdminPaymentReconciliationResponseAction,
  PaymentDecisionResponseAttemptStatus,
  PaymentDecisionResponseDepositStatus,
  PaymentDecisionResponseOrderStatus,
  PaymentDecisionResponseReconciliationAction,
} from './generated/embroidery-api.schemas';
export type {
  AdminOrderListParams,
  AdminOrderQueueResponse,
  AdminOrderQueueItemResponse,
  AdminOrderDetailResponse,
  AdminOrderItemResponse,
  AdminOrderPaymentsResponse,
  AdminPaymentObligationResponse,
  AdminPaymentAttemptResponse,
  AdminPaymentEvidenceResponse,
  AdminPaymentReconciliationResponse,
  PaymentDecisionResponse,
  VerifyPaymentAttemptBody,
  ReviewPaymentAttemptBody,
} from './generated/embroidery-api.schemas';

// The Admin commerce-completion workspace (`APP9-B01` final-payment entry,
// `APP9-B04` shipping detail read/save, `APP9-B05` dispatch freeze and order
// completion), consumed by `APP9-A01` on the existing `/orders/{orderId}`.
//
// Five operations, released consumer-driven — none of them had an approved
// control behind it until A01. The two APP7 payment decisions are **not**
// re-exported here: `adminPaymentAttemptVerify` and `adminPaymentAttemptReview`
// already cross above and are the same operations a REMAINING attempt is
// verified through, so APP9 adds no "final payment verify" of its own.
//
// ### The transition body admits exactly one destination
//
// `TransitionAdminOrderBodyTo` publishes `AWAITING_FINAL_PAYMENT` and nothing
// else, so the enum crosses as a **value**: the caller names the destination
// from the contract rather than spelling a literal that would compile just as
// well with a state `TR-LC14-05` does not serve.
//
// ### `AdminOrderTransitionResultResponse` reports an obligation it did not make
//
// `remainingObligationId` / `remainingObligationStatus` describe the REMAINING
// obligation created with the order back in `APP7-W01`. Opening the final
// payment neither creates, recalculates nor satisfies it — the order's new state
// is what makes it payable — and no screen built on this may say otherwise.
//
// ### Every shipping amount crosses as a `string`
//
// `feeAmount`, `previousFeeAmount` and `remainingAmount` are `numeric(14,2)`
// decimal strings. A VND amount through an IEEE-754 double is precision loss no
// later formatting can undo, so nothing downstream may compare or move one as a
// number.
//
// ### The nullable members arrive loosely typed
//
// Orval renders the contract's `nullable: true` string members —
// `feeAmount`, `carrierName`, `trackingCode`, `ward`, `district`, `frozenAt` —
// as `{ [key: string]: unknown } | null` rather than `string | null`, because
// the OpenAPI artifact declares them `type: "object"`. Generated code is never
// hand-edited, so the consumer narrows them at the seam instead; the contract
// defect itself is `FU-APP9-A01-01`.
export {
  adminOrderTransition,
  adminOrderShippingRead,
  adminOrderShippingSave,
  adminOrderDispatch,
  adminOrderComplete,
} from './generated/embroidery-api';
export {
  TransitionAdminOrderBodyTo,
  AdminShippingDetailResponseStatus,
  AdminOrderTransitionResultResponseStatus,
  AdminOrderDispatchResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  TransitionAdminOrderBody,
  AdminOrderTransitionResultResponse,
  AdminShippingDetailResponse,
  AdminShippingDetailSavedResponse,
  AdminShippingFeeOutcomeResponse,
  SaveShippingDetailBody,
  AdminOrderDispatchResponse,
  AdminOrderCompletionResponse,
} from './generated/embroidery-api.schemas';
