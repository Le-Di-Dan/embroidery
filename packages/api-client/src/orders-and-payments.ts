/**
 * The **customer** half of an order and the money against it: the secure
 * deposit surface (`APP7-B03`, `APP7-B05`), the secure final-payment surface
 * (`APP9-B02`), Ready-Made order creation (`APP12-B02`) and the secure
 * Ready-Made order surface (`APP12-B04`).
 *
 * The Admin half — the order queue and detail, the payment vertical, the two
 * decisions, evidence delivery, shipping, dispatch and completion — is
 * `admin-orders-and-payments.ts`. `APP12-A02-C1` split them along the boundary
 * that was already this file's internal structure: everything here is
 * authorized by a secure-link token carried in a request **body** and consumed
 * by the Storefront; everything there is behind `AuthenticatedAdminGuard` and
 * consumed by the Admin app. Two callers, two auth models, two sets of rules
 * about what may be said — and an operator screen can no longer reach a
 * customer command through an import that looked plausible.
 *
 * Both files are re-exported from the package index, so no consumer's import
 * path changed.
 *
 * ## Every amount crosses as a `string`
 *
 * Obligation amounts, attempt amounts, subtotals and totals are all decimal
 * strings. A VND amount through an IEEE-754 double is precision loss no later
 * formatting can undo, and no consumer of this barrel may turn one into a
 * number.
 *
 * ## `publicOrderShippingFee_acknowledge` is deliberately absent from the Admin half
 *
 * It is a **customer** command, and it lives here. An Admin write may never
 * mint the customer's acknowledgement of a higher shipping fee
 * (`APP9-B04-C1`), and the split is now what makes that structural rather than
 * a matter of self-discipline.
 */

// The customer secure deposit surface (`APP7-B03` read, initiation and QR;
// `APP7-B05` transfer evidence), consumed by `APP7-S01` at
// `/truy-cap/thanh-toan`. Exposed here so that feature never deep-imports the
// generated tree.
//
// ### All five carry the credential in a request body
//
// Every one of them is a `POST`, including the two that return an image or a
// list and write nothing. `ADR-APP4-001` §11 makes the URL fragment the only
// browser carrier for a secure token and marks a path or query carrier
// `FORBIDDEN` with no fallback, so a `GET …/qr?token=…` would put a live
// credential into the gateway access log, the application log, every proxy
// between and the `Referer` of any link the page then renders. The body types
// cross so the caller names the wire shape at the transport seam rather than
// assembling a literal that would compile just as well with the token in the
// wrong field.
//
// ### `publicOrderDepositCurrent` publishes no attempt state
//
// It returns the order code, the order and obligation status, the obligation's
// own frozen amount and currency, the server-owned bank instructions and the
// access expiry — and nothing about a payment attempt. Attempt status is
// reachable only through `publicOrderDepositInitiate`, which is idempotent and
// answers `replayed: true` with the attempt an identical earlier call opened.
// That asymmetry is a fact of the contract, not an omission to be repaired on
// the client, and it is why `DepositAttemptResponse` crosses beside the read.
//
// ### The QR is a `Blob`, and the evidence upload is multipart
//
// `publicOrderDepositQr` sets `responseType: 'blob'` itself, so no consumer
// configures transport to get the image. `publicOrderDepositEvidenceUpload`
// builds its own `FormData` and appends `accessToken`, `attemptId` and then
// `file` — alphabetical, which is exactly the order `APP7-B05` requires, the
// credential and the locator both arriving before the first byte of the image.
// Its `Idempotency-Key` has no generated parameter and travels through the
// operation's per-call config, as `APP5-B02`'s upload does.
//
// The status enums cross as **values** because the screen branches on each and
// a mistyped string literal is a comparison that is simply never true.
// `DepositAttemptResponseStatus` publishes the whole LC-16 vocabulary even
// though B03 only ever creates `PENDING`: a stored attempt may carry another
// and the screen renders what is stored rather than what it expected.
export {
  publicOrderDepositCurrent,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
  publicOrderDepositEvidenceUpload,
  publicOrderDepositEvidenceStatus,
} from './generated/embroidery-api';
export {
  CustomerDepositResponseDepositStatus,
  CustomerDepositResponseOrderStatus,
  DepositAttemptResponseMethod,
  DepositAttemptResponseStatus,
  TransferEvidenceItemResponseAssetStatus,
  TransferEvidenceItemResponseMediaType,
  TransferEvidenceUploadResponseAssetStatus,
} from './generated/embroidery-api.schemas';
export type {
  ReadDepositBody,
  InitiateDepositAttemptBody,
  DepositQrBody,
  ReadTransferEvidenceBody,
  PublicOrderDepositEvidenceUploadBody,
  CustomerDepositResponse,
  DepositBankInstructionsResponse,
  DepositAttemptResponse,
  TransferEvidenceItemResponse,
  TransferEvidenceListResponse,
  TransferEvidenceUploadResponse,
} from './generated/embroidery-api.schemas';

// The customer secure final-payment surface (`APP9-B02`), consumed by
// `APP9-S01` on one Storefront route.
//
// Three operations, released consumer-driven: until S01 there was no approved
// customer screen behind any of them. They are the **sibling** of the deposit
// lane above, not a replacement for it — same base path, same locator-free
// `POST` shape, same secure-link body carrier, same idempotency namespace — and
// the two lanes move independently because `REMAINING` and `DEPOSIT` are
// different obligations (`CST-039`).
//
// ### No evidence operation is added here
//
// `APP9-B02` generalised `EvidenceAttemptAuthorizer` to
// `['DEPOSIT', 'REMAINING']` rather than publishing a second evidence route, so
// a `REMAINING` attempt resolves through `publicOrderDepositEvidenceUpload` and
// `publicOrderDepositEvidenceStatus` already exported above. Those two names are
// deposit-flavoured **transport** names for a route APP9 may not rename
// (`FU-APP9-B02-01`); no screen built on this barrel may let that wording reach
// a customer.
//
// ### `payable` is the gate, and it is the server's
//
// `CustomerFinalPaymentResponse.payable` is derived on every read from the
// order's state and the obligation's, and the QR and the attempt both answer
// `409 FINAL_PAYMENT_NOT_PAYABLE` when it is false. It is not a claim that
// anything was paid — that is `finalPaymentStatus` — and nothing downstream may
// substitute the order status for it.
//
// ### The amount is the obligation's own frozen figure
//
// `finalPaymentAmount` is exact `numeric(14,2)` VND as a decimal **string**,
// copied from the accepted quotation at order creation. It is never recomputed
// as a total minus a deposit, and this barrel publishes neither an order total
// nor a deposit amount through which a consumer could try.
export {
  publicOrderFinalPaymentCurrent,
  publicOrderFinalPaymentInitiate,
  publicOrderFinalPaymentQr,
} from './generated/embroidery-api';
export {
  CustomerFinalPaymentResponseFinalPaymentStatus,
  CustomerFinalPaymentResponseOrderStatus,
  FinalPaymentAttemptResponseMethod,
  FinalPaymentAttemptResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  ReadFinalPaymentBody,
  InitiateFinalPaymentAttemptBody,
  FinalPaymentQrBody,
  CustomerFinalPaymentResponse,
  FinalPaymentBankInstructionsResponse,
  FinalPaymentAttemptResponse,
} from './generated/embroidery-api.schemas';

// The public Ready-Made order-creation command (`APP12-B02`), consumed by
// `APP12-S02` on the one Storefront checkout route.
//
// One operation, released consumer-driven: `APP12-B02` delivered it, and until
// `/mua-hang/[slug]` existed there was no approved surface behind it.
//
// `publicReadyMadeOrder_current` was withheld here until `APP12-S03` landed, so
// that a checkout could not reach for the order it had just created instead of
// stopping where the token stops (`APP12-S02` §23). It is released in its own
// block below, beside the rest of the secure order surface.
//
// ### The challenge is the idempotency scope, not a header
//
// `CreateReadyMadeOrderBody.challengeId` is a VERIFIED, unexpired
// `SUBMISSION` challenge, and it authorizes the write *and* scopes its
// idempotency: the same body on the same challenge replays the first result, a
// different body on it is refused. There is no `Idempotency-Key` parameter on
// this operation and none should be added by a consumer.
//
// ### No amount crosses inbound
//
// The body carries a SKU, a quantity, the challenge and the delivery facts, and
// has no field for a price, a subtotal or a total. The server resolves the price
// and re-checks availability under the stock lock, and the response's
// `merchandiseSubtotal` is the frozen figure it wrote — a decimal **string**,
// like every other amount on this boundary. `ReadyMadeOrderAccessBootstrapResponse`
// publishes only that a link was handed to the notification path and when it
// expires; the link itself is never in the response and cannot be recovered.
export { publicReadyMadeOrderCreate } from './generated/embroidery-api';
export { ReadyMadeOrderAccessBootstrapResponseScopeKind } from './generated/embroidery-api.schemas';
export type {
  CreateReadyMadeOrderBody,
  ReadyMadeOrderDelivery,
  ReadyMadeOrderCreatedResponse,
  ReadyMadeOrderSubtotalResponse,
  ReadyMadeOrderAccessBootstrapResponse,
} from './generated/embroidery-api.schemas';

// The secure Ready-Made order surface (`APP12-B04`, `APP12-B04-C1`), consumed
// by `APP12-S03` on the one `/truy-cap/don-hang` route.
//
// Four operations released together, consumer-driven, because they are one
// screen: the order projection decides the lifecycle, and the three FULL
// operations are reachable only from the one state that projection reports as
// payable. Releasing the read without the obligation, or the obligation without
// the read, would put half a surface on the boundary.
//
// ### Every one of the four is authorized by the same fragment token
//
// The token travels in a request **body** and never in a path, a query or a
// header, so it cannot reach a gateway or proxy access log
// (`ADR-APP4-001` §11). Each of the four runs the whole grant chain itself —
// policy, the secure-link limiter, grant resolution, then the customer-safe
// projection — which is precisely why a consumer must **not** chain
// `publicSecureLinkResolve` in front of one: doing so authorizes the same
// bearer twice, spends the same abuse budget twice, and returns no fact the
// call does not already carry (`APP12-S03` §7).
//
// ### `ReadyMadeOrderAccessResponseTerminationReason` is the expiry authority
//
// It is exported as a **value** enum, not merely as a type, because the one
// legitimate client-side reading of "this order expired rather than being
// cancelled" is `terminationReason === RESERVATION_EXPIRED`. The field is spread
// rather than assigned, so an ordinary cancellation publishes no key at all. A
// consumer that instead parsed a free-text reason, or compared a deadline
// against its own clock, would be running a second lifecycle in the browser —
// which `APP12-S03` §13 and §29 forbid outright.
//
// ### No amount crosses inbound, and none is composed outbound
//
// None of the three FULL bodies carries an amount, a reference, an obligation
// kind or an order id: the server derives all of them. `fullPaymentAmount` and
// `payableTotal` are the obligation's own frozen figures as decimal **strings**,
// and the contract states plainly that the total "is not re-derived from" the
// subtotal and the fee beside it. A consumer adds nothing.
//
// ### The QR is bytes, and evidence is the deposit lane's route
//
// `publicOrderFullPaymentQr` answers PNG bytes generated per request and stored
// nowhere. Transfer evidence has **no** Ready-Made operation of its own:
// `APP12-B04` widened `APP7-B05`'s evidence authorizer to accept a `FULL`
// attempt rather than publishing a second endpoint, so a consumer reuses
// `publicOrderDepositEvidenceUpload` / `_status` — already on this boundary —
// and keeps the deposit wording out of its own copy.
export {
  publicReadyMadeOrderCurrent,
  publicOrderFullPaymentCurrent,
  publicOrderFullPaymentInitiate,
  publicOrderFullPaymentQr,
} from './generated/embroidery-api';
export {
  ReadyMadeOrderAccessResponseStatus,
  ReadyMadeOrderAccessResponseTerminationReason,
  ReadyMadeOrderPaymentResponseStatus,
  CustomerFullPaymentResponseFullPaymentStatus,
  CustomerFullPaymentResponseOrderStatus,
  FullPaymentAttemptResponseMethod,
  FullPaymentAttemptResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  ReadReadyMadeOrderBody,
  ReadyMadeOrderAccessResponse,
  ReadyMadeOrderDeliveryResponse,
  ReadyMadeOrderItemResponse,
  ReadyMadeOrderPaymentResponse,
  ReadFullPaymentBody,
  InitiateFullPaymentAttemptBody,
  FullPaymentQrBody,
  CustomerFullPaymentResponse,
  FullPaymentBankInstructionsResponse,
  FullPaymentAttemptResponse,
} from './generated/embroidery-api.schemas';
