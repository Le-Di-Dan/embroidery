/**
 * Quotation and design review (`APP6`), both sides of it: the customer's secure
 * quotation read and accept/reject decisions, the customer's secure design
 * review, the Admin quotation workbench and the Admin design-case workbench.
 *
 * One domain, because it is one negotiation. A quotation version the Admin
 * drafts is the version the customer accepts; a design version the Admin sends
 * is the one the customer approves or sends back for revision. Every decision
 * body below names the exact version it is about, so a stale screen cannot
 * decide about a newer one.
 *
 * Every customer operation carries its secure-link token in a request **body**.
 */

// Public customer quotation read and decisions (APP6-B04, APP6-B05), consumed
// by the Storefront secure-quotation screen (APP6-S01). Exposed here so that
// feature never deep-imports the generated tree.
//
// All three bodies carry the secure-link token in a request **body**, never a
// path segment, query parameter or header — the same rule `ResolveSecureLinkBody`
// states, for the same reason: a bearer credential must not reach an access log.
// The body types are exported so the caller names the wire shape at the
// transport seam rather than assembling a literal that would compile just as
// well with the token in the wrong field.
//
// The two decision bodies also carry `versionId`, and that field is the whole
// exactness contract: the server checks it against the quotation's own current
// pointer inside the deciding transaction, so a superseded version is refused
// rather than silently upgraded. It is a **locator the customer was shown**, not
// an authority — every other identifier (request, quotation, customer, grant,
// challenge) is derived server-side and is absent from these schemas.
//
// The status enums cross as **values** because the screen branches on each and a
// mistyped string literal is a comparison that is simply never true. The request
// status on the accepted response crosses for the same reason, and is displayed
// nowhere: it is the server's own projection, read back so the screen can state
// that a request moved without the screen ever having asked it to.
export {
  publicQuotationCurrent,
  publicQuotationAccept,
  publicQuotationReject,
} from './generated/embroidery-api';
export {
  CustomerQuotationResponseStatus,
  CustomerQuotationResponseQuotationStatus,
  CustomerQuotationLineItemResponseLineKind,
  QuotationAcceptedResponseVersionStatus,
  QuotationAcceptedResponseQuotationStatus,
  QuotationAcceptedResponseRequestStatus,
  QuotationRejectedResponseVersionStatus,
  QuotationRejectedResponseQuotationStatus,
} from './generated/embroidery-api.schemas';
export type {
  ReadCurrentQuotationBody,
  AcceptQuotationBody,
  RejectQuotationBody,
  CustomerQuotationResponse,
  CustomerQuotationLineItemResponse,
  QuotationAcceptedResponse,
  QuotationRejectedResponse,
} from './generated/embroidery-api.schemas';

// The customer secure design review (`APP6-B10` read, `APP6-B11` decisions),
// consumed by `APP6-S02` at `/truy-cap/duyet-thiet-ke`.
//
// Three operations, released consumer-driven: until S02 there was no approved
// control behind any of them, and the Admin design-case workbench deliberately
// left them uncrossed so that a staff screen could never be one careless import
// away from approving a design on the customer's behalf. That reasoning is
// unchanged — the block below is reached by the *customer* surface, and the
// Admin block still exports none of it.
//
// The `token` travels in a request **body** in all three, never as a path
// segment, query parameter or header, so a bearer credential cannot reach an
// access log. The body types cross so the caller names the wire shape at the
// transport seam rather than assembling a literal that would compile just as
// well with the token in the wrong field.
//
// ### The bodies are the exactness contract
//
// `versionId` on both decisions is a **locator the customer was shown**, not an
// authority: the server checks it against the grant's own request and design
// case inside the deciding transaction. `documentHash` and `acceptedAgreements`
// exist on the approval alone, and `RequestDesignRevisionBody` publishes
// neither — which is what keeps a revision request from ever carrying consent
// it did not ask for. Every other identifier (request, design case, customer,
// grant, challenge) is derived server-side and is absent from these schemas.
//
// ### `document` is the concrete `DesignDocument`
//
// The review response references the single generated `APP3-P01` component, so
// the stored document never passes through an index signature on its way to a
// renderer. `TransportDesignDocument` above remains the name for the wire
// shape; `@embroidery/design-document` remains the authority on structure and
// validation, and nothing validates a document against these declarations.
//
// The version- and request-status enums cross as **values** so the outcome
// cards read the states the server publishes rather than a hand-kept list that
// could drift.
export {
  publicDesignReviewCurrent,
  publicDesignReviewApprove,
  publicDesignReviewRequestRevision,
} from './generated/embroidery-api';
export {
  DesignApprovedResponseVersionStatus,
  DesignApprovedResponseRequestStatus,
  DesignRevisionRequestedResponseVersionStatus,
  DesignRevisionRequestedResponseRequestStatus,
} from './generated/embroidery-api.schemas';
export type {
  ReadCurrentDesignReviewBody,
  ApproveDesignVersionBody,
  ApproveDesignVersionBodyAcceptedAgreementsItem,
  RequestDesignRevisionBody,
  CustomerDesignReviewResponse,
  DesignReviewAgreementResponse,
  DesignApprovedResponse,
  DesignRevisionRequestedResponse,
} from './generated/embroidery-api.schemas';

// The Admin quotation workbench (`APP6-B01` drafting, `APP6-B02` reads,
// `APP6-B03` send), consumed by `APP6-A01`.
//
// Five operations, released consumer-driven: until A01 there was no approved
// control behind any of them, so none crossed. They arrive together because the
// screen is one workbench — a draft that could be created but never listed, or
// listed but never sent, is not a deliverable surface.
//
// `adminQuotationSendVersion` takes **no body**. The version being sent is
// named entirely by the path, and there is deliberately no shape a caller could
// use to send one version while naming another.
//
// ### Every amount crosses as a `string`
//
// `APP6-G01` §6.2 forbids a VND amount through an IEEE-754 double, and the
// generated types honour it because the API publishes `type: String` on each
// one. Nothing here re-types an amount as a `number`, and no consumer may
// recompute a total from parts: `lineTotalAmount`, `subtotalAmount`,
// `totalAmount`, `depositAmount` and `remainingAmount` are server-derived
// facts, and the two request bodies deliberately have no field for any of them.
//
// The two `lineKind` enums cross as **values** so the authoring form offers
// exactly the kinds the server accepts, rather than a hand-kept list that could
// drift. `AdminQuotationVersionResponseStatus` crosses for the same reason on
// the read side: history renders every stored state, superseded and expired
// included.
export {
  adminQuotationCreate,
  adminQuotationAddVersion,
  adminQuotationVersionHistory,
  adminQuotationVersionDetail,
  adminQuotationSendVersion,
} from './generated/embroidery-api';
export {
  AddQuotationVersionBodyLineItemsItemLineKind,
  CreateQuotationDraftBodyLineItemsItemLineKind,
  AdminQuotationLineItemResponseLineKind,
  AdminQuotationVersionResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  AddQuotationVersionBody,
  AddQuotationVersionBodyLineItemsItem,
  CreateQuotationDraftBody,
  CreateQuotationDraftBodyLineItemsItem,
  QuotationDraftedResponse,
  AdminQuotationHeaderResponse,
  AdminQuotationVersionResponse,
  AdminQuotationLineItemResponse,
  AdminQuotationVersionHistoryResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationSentResponse,
} from './generated/embroidery-api.schemas';

// The Admin design-case workbench (`APP6-B07` submitted source, `APP6-B08`
// authoring and history, `APP6-A02` exact-version detail, `APP6-B09` send),
// consumed by `APP6-A02`.
//
// Five operations, released consumer-driven: until A02 there was no approved
// control behind any of them, so none crossed. `APP6-B07` and `APP6-B08`
// deliberately left their curated exports to this checkpoint rather than
// publishing operations with no screen behind them. They arrive together
// because the screen is one workbench — a version that could be drafted but
// never opened, or opened but never sent, is not a deliverable surface.
//
// ### The two customer operations are **not** here
//
// `publicDesignReview_current`, `_approve` and `_requestRevision` share types
// with these — `DesignDocument` above all — and none of them crosses. `APP6-B11`
// owns the customer decision surfaces; an Admin screen that could reach
// `publicDesignReviewApprove` would be one careless import away from approving a
// design on the customer's behalf, which is the one thing this workbench must
// never be able to do. Sharing a type is not a reason to share an operation.
//
// ### `adminCustomRequestDesignVersionSend` takes no body
//
// The version being sent is named entirely by the path, and there is
// deliberately no shape a caller could use to send one version while naming
// another. `AuthorDesignVersionBody` is `.strict()` server-side and carries only
// the document and the four customer-owned placement facts: the request id, the
// case id, the branch, the catalog quartet, the status, the version number, the
// parent and the hash are all server-owned and have no field here to arrive in.
//
// ### `document` is the concrete `DesignDocument`
//
// Both the detail response and the authoring body reference the single generated
// `APP3-P01` component, so a document read from one version and posted as the
// source of the next never passes through an index signature. The
// `TransportDesignDocument` alias above remains the name for the wire shape;
// `@embroidery/design-document` remains the authority on structure and
// validation, and nothing validates a document against these declarations.
//
// The version-status, branch and review-outcome enums cross as **values** so the
// screen derives its action matrix and its labels from the contract rather than
// from a hand-kept list that could drift from what the server publishes.
export {
  adminCustomRequestSubmittedDesignGet,
  adminCustomRequestDesignVersionList,
  adminCustomRequestDesignVersionCreate,
  adminCustomRequestDesignVersionDetail,
  adminCustomRequestDesignVersionSend,
} from './generated/embroidery-api';
export {
  DesignVersionResponseStatus,
  DesignVersionResponseBranch,
  DesignVersionReviewResponseOutcome,
  DesignVersionDetailResponseStatus,
  DesignVersionDetailResponseBranch,
  DesignVersionDetailReviewResponseOutcome,
  ApprovalEvidenceResponseBranch,
  DesignVersionSentResponseVersionStatus,
} from './generated/embroidery-api.schemas';
export type {
  AdminSubmittedDesignResponse,
  AdminSubmittedDesignSourceResponse,
  AuthorDesignVersionBody,
  DesignVersionResponse,
  DesignVersionReviewResponse,
  DesignVersionCreatedResponse,
  DesignVersionListResponse,
  DesignVersionDetailResponse,
  DesignVersionDetailReviewResponse,
  ApprovalEvidenceResponse,
  ApprovalAgreementResponse,
  DesignVersionSentResponse,
} from './generated/embroidery-api.schemas';
