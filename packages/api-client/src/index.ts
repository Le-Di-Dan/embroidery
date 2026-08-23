export { HTTP_TIMEOUT_MS } from './config/http-constants';
export type { ApiClientConfig } from './config/api-client-config';
export { createBrowserApiClient } from './clients/create-browser-api-client';
export { createServerApiClient } from './clients/create-server-api-client';
export { API_CLIENT_ERROR_CODES } from './errors/api-client-error-codes';
export type { NormalizedApiError } from './errors/normalized-api-error';
export { normalizeApiClientError } from './errors/normalize-api-client-error';

// Per-call options that inject a repository-owned Axios instance into every
// generated operation. Feature services pass `{ instance }` obtained from the
// browser/server client factories above.
export type { ApiRequestOptions } from './clients/api-request.mutator';

// Generated operation functions (Orval `axios-functions` + `apiRequest`
// mutator, IMP-D023). Generated code is never hand-edited; regenerate with
// `pnpm --filter @embroidery/api-client generate`.
export { healthCheck, healthReadiness } from './generated/embroidery-api';
export type { HealthCheckResult, HealthReadinessResult } from './generated/embroidery-api';

// Staff session operations (APP1). Exposed on the public boundary so feature
// and server code (Admin login screen, server-side session resolution) never
// deep-imports the generated tree.
export { staffSessionCreate, staffSelfGet, staffSessionDelete } from './generated/embroidery-api';
export type {
  StaffLoginRequest,
  StaffSelfGet200,
  CurrentStaffResponse,
} from './generated/embroidery-api.schemas';

// Admin asset intake operations (APP2-B01). Exposed on the public boundary so
// the Admin Assets capability never deep-imports the generated tree. The
// generated `assetKind`/`classification` enums are re-exported as values so a
// caller supplies the fixed multipart metadata from the contract instead of
// hard-coding a literal.
export { adminAssetUpload, adminAssetDetail, adminAssetList } from './generated/embroidery-api';
export {
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
} from './generated/embroidery-api.schemas';
export type {
  AdminAssetDetailResponse,
  AdminAssetListResponse,
  AdminAssetListParams,
  AdminAssetUploadBody,
  AdminAssetUploadReceiptResponse,
} from './generated/embroidery-api.schemas';

// Admin product read + draft-authoring operations (APP2-B02). `adminProductList`
// serves the read-only list (`APP2-A02`); create, detail and update serve the
// product form/detail capability (`APP2-A03`).
//
// Still deliberately withheld: `adminProductArchive`, which has no approved
// surface (`FU-APP2-PRODUCT-ARCHIVE-UI-01`). Archive is not unpublish — it is a
// separate lifecycle transition with its own reason requirement — so keeping it
// off this boundary is what stops a publication screen from reaching it by
// mistake while `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` is still open.
//
// The query enums are re-exported as values so filter and category options are
// derived from the contract rather than hard-coded.
export {
  adminProductList,
  adminProductCreate,
  adminProductDetail,
  adminProductUpdate,
} from './generated/embroidery-api';
export {
  AdminProductListStatus,
  AdminProductListCategorySlug,
  AdminProductDetailResponseStatus,
  AdminProductMediaResponseRole,
} from './generated/embroidery-api.schemas';
export type {
  AdminProductListParams,
  AdminProductListResponse,
  AdminProductSummaryResponse,
  AdminProductCategoryResponse,
  AdminProductDetailResponse,
  AdminProductMediaResponse,
  CreateProductBody,
  UpdateProductBody,
} from './generated/embroidery-api.schemas';

// Admin product publication operations (APP2-B03), exposed for the Admin
// publication interaction (`APP2-A04`). All three cross the boundary together:
// the readiness report is only meaningful next to the command it describes, and
// publish and unpublish are the two directions of one transition.
//
// `AdminProductRequirementResponseCode` is re-exported as a value on purpose.
// The screen renders the complete requirement set in the server's order, so the
// codes have to come from the contract — deriving them from a hand-kept list
// would let the two drift, and the drift would show up as a silently missing
// requirement row rather than as a build failure.
export {
  adminProductPublicationReadiness,
  adminProductPublish,
  adminProductUnpublish,
} from './generated/embroidery-api';
export {
  AdminProductRequirementResponseCode,
  AdminProductPublicationReadinessResponseStatus,
  AdminProductPublicationResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  AdminProductPublicationReadinessResponse,
  AdminProductPublicationResponse,
  AdminProductRequirementResponse,
  PublishProductBody,
  UnpublishProductBody,
} from './generated/embroidery-api.schemas';

// Admin Product placement authoring (APP3-B01), exposed for the Admin
// placement screen (`APP3-A01`). The read and the replace cross together: the
// read is the only source of the `updatedAt` the replace must echo back, so an
// operation boundary that offered one without the other would publish a write
// nobody could safely perform.
//
// `publicProductPlacementGet` was withheld here through `APP3-A01`. It answers a
// deliberately narrower model — no `backgroundAssetId`, no retired rows and no
// concurrency token — and putting it on this boundary beside the Admin pair
// would have invited an authoring screen to bind to it and silently lose the
// history the operator is meant to see. It crosses with `APP3-S01`, its first
// real consumer, in the Studio block below; the rule it protected is unchanged,
// and A01's own gate still asserts the authoring screen calls the Admin pair.
export { adminProductPlacementGet, adminProductPlacementReplace } from './generated/embroidery-api';
export type {
  AdminProductPlacementResponse,
  AdminPlacementSideResponse,
  AdminPlacementAreaResponse,
  ReplaceProductPlacementBody,
  ReplacePlacementSideBody,
  ReplacePlacementAreaBody,
} from './generated/embroidery-api.schemas';

// Admin Side background delivery (APP3-B02A), exposed for the placement preview
// (`APP3-A01-C1`).
//
// `APP3-B02A` deliberately withheld this from the boundary because no consumer
// existed — an operation here is an invitation to call it, which is the same
// reasoning that keeps `publicProductMediaGet` off it. `APP3-A01-C1` is that
// consumer: it renders the Side's real background so Embroidery Areas are
// authored on the actual image rather than on an empty frame.
//
// It resolves to a `Blob`. The caller turns that into a browser object URL as a
// purely local rendering handle — never persisted, never sent back, and not a
// storage address. No bucket, key or provider URL crosses this boundary in
// either direction.
//
// `publicProductSideBackgroundGet` stays withheld for the reason it always was:
// it requires the Product to be PUBLISHED, and placement is authored while the
// Product is still a draft.
export { adminProductSideBackgroundGet } from './generated/embroidery-api';

// Admin Design Template management (APP3-B03), exposed for the Template list
// screen (`APP3-A02`).
//
// The list and the create cross together because the list screen owns the
// create entry point: a list you cannot add to is a dead end, and the create
// response is what the list is reconciled from.
//
// `adminDesignTemplate_detail` and `adminDesignTemplate_saveDocument` crossed
// with the Template editor (`APP3-A03`), which is the consumer this boundary was
// waiting for. They cross **together**: the detail read is the only source of
// the `expectedCurrentVersion` the save must echo back, so offering one without
// the other would publish a write nobody could safely perform.
//
// The detail read staying off the boundary until now was not caution about the
// operation — it was about *who* could reach it. A list screen that can resolve
// a row by fetching it is the N+1 a keyset list exists to avoid, and that rule
// is unchanged: `APP3-A02`'s own gate still asserts the list never performs a
// detail read, and now asserts it against a boundary where the operation exists.
//
// `adminDesignTemplate_assignScope` crosses with `APP3-A03-C1`, its first and
// only consumer. `APP3-B03B` published it and deliberately kept it off this
// boundary, because a backend checkpoint exposing an operation no screen calls
// is an invitation with nobody to accept it.
//
// It is a **one-time initial** assignment, not a scope editor: the server admits
// it only for an unscoped, versionless `DRAFT`, and there is no rescope or
// clear-scope operation to pair it with. Nothing here should ever grow one.
//
// The four LC-24 lifecycle operations cross with `APP3-A04`, the lifecycle
// screen, and they cross **together**. They are one state machine: a surface
// that could publish but not unpublish, or archive but not restore, would strand
// an operator in a state with no way back — and `restore` in particular is the
// only exit from `ARCHIVED`, so withholding it would make archive behave like
// the delete it is explicitly not. `APP3-B04A` delivered it for exactly this.
//
// They stayed withheld through `APP3-A02` and `APP3-A03` because an operation on
// this boundary is an invitation to add a button for it, and neither of those
// screens is lifecycle mutation. That rule has not been relaxed — it has been
// *satisfied*: the consumer now exists, and A02's and A03's own gates still
// assert that neither of them calls one.
//
// The status enum is re-exported as a value so the filter options are derived
// from the contract rather than a hand-kept list that could drift out of step
// with the three lifecycle states the server actually accepts.
export {
  adminDesignTemplateCreate,
  adminDesignTemplateList,
  adminDesignTemplateDetail,
  adminDesignTemplateSaveDocument,
  adminDesignTemplateAssignScope,
  adminDesignTemplatePublish,
  adminDesignTemplateUnpublish,
  adminDesignTemplateArchive,
  adminDesignTemplateRestore,
} from './generated/embroidery-api';
export { AdminDesignTemplateListStatus } from './generated/embroidery-api.schemas';
export type {
  AdminDesignTemplateListParams,
  AdminDesignTemplateListResponse,
  AdminDesignTemplateSummaryResponse,
  AdminDesignTemplateDetailResponse,
  AdminDesignTemplateScopeResponse,
  AdminDesignTemplateVersionResponse,
  CreateDesignTemplateBody,
  SaveDesignTemplateDocumentBody,
  AssignDesignTemplateScopeBody,
  PublishDesignTemplateBody,
  UnpublishDesignTemplateBody,
  ArchiveDesignTemplateBody,
  RestoreDesignTemplateBody,
} from './generated/embroidery-api.schemas';

// The generated Design Document transport types (`APP3-A03`).
//
// These are Orval's projection of the *same* `APP3-P01` types the
// `@embroidery/design-document` package owns — the OpenAPI schema is generated
// from them. They are exposed only so a caller can name the wire shape at the
// transport seam; `@embroidery/design-document` remains the single authority on
// document structure, schema version, quantization and validation, and nothing
// may validate a document against these declarations instead.
export type {
  DesignDocument as TransportDesignDocument,
  DesignPlacementSnapshot as TransportDesignPlacementSnapshot,
} from './generated/embroidery-api.schemas';

// Anonymous public catalog reads (APP2-B04): the listing for the Storefront
// Discover feed (`APP2-S01`) and the detail resolver for Product Detail
// (`APP2-S02`).
//
// `publicProductDetail` crossed this boundary in `APP2-S02`, once IMP-D039
// locked `/san-pham/[slug]`. It was withheld until then precisely because a
// route did not exist, and the two facts belong together: an operation on the
// public boundary is an invitation to render a page for it.
//
// `publicProductMediaGet` stays withheld, for a different reason that has not
// changed: it serves image bytes, which the browser fetches by rendering the
// relative `media[].url` the list and detail responses already return —
// application code must never stream those bytes itself.
//
// The category enum is re-exported as a value so the Storefront's category chips
// are derived from the contract rather than a hand-kept list that could drift
// out of step with the four categories the database actually provisions.
export { publicProductList, publicProductDetail } from './generated/embroidery-api';
export { PublicProductListCategorySlug } from './generated/embroidery-api.schemas';
export type {
  PublicProductListParams,
  PublicProductListResponse,
  PublicProductSummaryResponse,
  PublicProductDetailResponse,
  PublicProductSeoResponse,
  PublicCategoryResponse,
  PublicMediaReferenceResponse,
} from './generated/embroidery-api.schemas';

// Anonymous Studio bootstrap (APP3-S01): the public placement manifest, the two
// published-Template reads, the Template asset delivery and the two Session
// operations the Studio route actually calls.
//
// They cross together because they are one journey and each is meaningless
// without the next: the manifest is the only Side/Area authority, the list is
// compatible with exactly one `product → side → area` triple the manifest
// produced, the detail resolves the chosen Template's published document, the
// asset route is the only address that serves a byte referenced by that
// document, and the create/resume pair is what turns a choice into a session.
//
// `publicDesignTemplateAssetGet` (`APP3-B05A`) resolves to a `Blob`. The caller
// turns it into a browser object URL as a purely local rendering handle — never
// persisted, never sent back, never a storage address. Publication, the current
// published version, document membership, the durable association, placement
// eligibility and the derivative are all re-proved by the server on every
// request, so the address grants nothing on its own.
//
// The two `mode` enums are re-exported as **values** because the create body is
// a discriminated union: `BLANK` and `CLONE_TEMPLATE` must come from the
// contract, not from a literal a screen could mistype into a request the server
// would refuse for a reason nobody could see in the diff.
//
// `APP3-S06` releases the three Session-asset operations, because the screen
// that owns them now exists. They are released **together** and only together:
// an upload that could not be polled would leave the Studio guessing, and a
// preview without a status would have to poll the binary route as a state
// machine — which is exactly the misuse `publicDesignSessionAssetStatus` exists
// to prevent, since the binary route answers one indistinguishable 404 for
// eleven different private misses.
//
// `publicDesignSessionAssetGet` resolves to a `Blob`, like the Template asset
// and Side background above and for the same reason: the caller turns it into a
// browser object URL as a purely local rendering handle — never persisted into
// the design document, never sent back, never a storage address.
//
// `APP3-S10` releases `publicDesignSessionAutosave`, on exactly the terms the
// withholding stated: persistence was withheld until the screen that owns saving
// existed, and it now does. The condition is satisfied rather than relaxed —
// every predecessor's gate still asserts that *its* screens call nothing here,
// and S10's own gate asserts that the only caller is its autosave service.
//
// It is the one **write** in this allowlist. `APP3-B08` guards it with
// compare-and-set on a revision the client may only ever have *read*: a
// mismatch is refused `409` with zero write, so the operation cannot be misused
// into a silent overwrite even by a caller that wanted to.
//
// Deliberately still withheld:
//
// - `publicProductMediaGet`, unchanged: product images are fetched by the
//   browser from the relative `media[].url` the catalog responses return.
//
// `publicProductSideBackgroundGet` crossed with `APP3-S02`, the stage that
// finally renders one. S01 withheld it for the reason stated at the time — it
// rendered no stage, so it needed no background bytes — and that rule is
// satisfied rather than relaxed: S01's own gate still asserts the bootstrap
// screen never calls it.
//
// It resolves to a `Blob`, like the Template asset above and for the same
// reason. The caller turns it into a browser object URL as a purely local
// rendering handle — never persisted, never sent back, never a storage address.
// The address is contextual: a public Product slug and a Side's stable public
// code, neither of which is an asset id, a derivative id or a storage key, and
// the server re-proves publication, side activity and the derivative on every
// request.
export {
  publicProductPlacementGet,
  publicProductSideBackgroundGet,
  publicDesignTemplateList,
  publicDesignTemplateDetail,
  publicDesignTemplateAssetGet,
  publicDesignSessionCreate,
  publicDesignSessionResume,
  publicDesignSessionAutosave,
  publicDesignSessionAssetCreate,
  publicDesignSessionAssetGet,
  publicDesignSessionAssetStatus,
} from './generated/embroidery-api';
export {
  CreateBlankDesignSessionBodyMode,
  CloneDesignSessionBodyMode,
  // Re-exported as **values** so the Studio branches on contract states rather
  // than on string literals a screen could mistype into a comparison that is
  // simply never true.
  DesignSessionAssetStatusResponseState,
  DesignSessionAssetStatusResponseMediaType,
} from './generated/embroidery-api.schemas';
export type {
  PublicProductPlacementResponse,
  PublicPlacementSideResponse,
  PublicPlacementAreaResponse,
  PublicDesignTemplateListParams,
  PublicDesignTemplateListResponse,
  PublicDesignTemplateSummaryResponse,
  PublicDesignTemplateDetailResponse,
  PublicDesignTemplateVersionResponse,
  PublicDesignTemplateScopeResponse,
  CreateDesignSessionBody,
  CreateBlankDesignSessionBody,
  CloneDesignSessionBody,
  AutosaveDesignSessionBody,
  DesignSessionSnapshotResponse,
  DesignSessionScopeResponse,
  DesignSessionLineageResponse,
  PublicDesignSessionAssetCreateBody,
  DesignSessionAssetIntakeResponse,
  DesignSessionAssetStatusResponse,
} from './generated/embroidery-api.schemas';

// Public contact-verification operations (APP4-B03, APP4-B04), consumed by the
// Storefront verification capability (APP4-S01). Exposed here so that feature
// never deep-imports the generated tree.
//
// `publicVerificationReadStatus` is included deliberately: the refusals carry no
// business error code, so a 422 mismatch and a 422 expired challenge — and a 429
// lockout and a 429 rate limit — are indistinguishable by code alone. The status
// read is the only way to resolve an authoritative terminal state after a
// refusal, and the alternative is parsing human-readable messages.
export {
  publicVerificationIssue,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
  publicVerificationReadStatus,
} from './generated/embroidery-api';
export {
  // Values, not just types: the contact kind, the purpose and the lifecycle
  // state are all things the UI branches on, and a mistyped string literal is a
  // comparison that is simply never true.
  IssueVerificationChallengeBodyContactKind,
  IssueVerificationChallengeBodyPurpose,
  VerificationChallengeStatusResponseState,
} from './generated/embroidery-api.schemas';
export type {
  IssueVerificationChallengeBody,
  SubmitVerificationAttemptBody,
  VerificationChallengeResponse,
  VerificationChallengeStatusResponse,
} from './generated/embroidery-api.schemas';

// Public secure-link resolution (APP4-B06), consumed by the Storefront
// secure-link landing (APP4-S02). Exposed here so that feature never
// deep-imports the generated tree.
//
// It crosses alone. There is no companion operation and there must not be one:
// every token that does not open a live grant — unknown, expired, revoked,
// superseded, wrong target, wrong purpose — answers one identical
// `404 SECURE_LINK_UNAVAILABLE`, and a second "why did that fail" operation
// beside it would be the enumeration oracle the collapse exists to prevent
// (`APP4-G01` PO-04, approved annotation `634:59`).
//
// The token travels in `ResolveSecureLinkBody` — a request **body**, never a
// path segment, query parameter or header — which is what keeps a bearer
// credential out of every access log between the browser and the API. The type
// is exported so the caller names the wire shape at the transport seam rather
// than assembling an object literal that would compile just as well with the
// token in the wrong field.
//
// `SecureLinkResolutionResponseScopeKind` is re-exported as a **value** because
// the landing page branches on the scope it was granted, and a mistyped string
// literal is a comparison that is simply never true.
export { publicSecureLinkResolve } from './generated/embroidery-api';
export { SecureLinkResolutionResponseScopeKind } from './generated/embroidery-api.schemas';
export type {
  ResolveSecureLinkBody,
  SecureLinkResolutionResponse,
} from './generated/embroidery-api.schemas';

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

// Admin Customer support and notification delivery (APP4-B07, APP4-B08),
// consumed by the Admin customer-access support screen (APP4-A01). Exposed here
// so that feature never deep-imports the generated tree.
//
// Five operations, and the shape of the set is the boundary. There is no Admin
// grant *issue* or *reissue* here and there must not be: revocation mints
// nothing, and restoring access is a fresh issue through the business flow
// (`APP4-B05`), which has no HTTP surface at all. There is no customer list,
// create, update or merge, because none exists to export.
//
// `adminCustomerSupportResolve` is the screen's entry point and the one
// operation that carries a real contact. It takes `ResolveCustomerByContactBody`
// — a request **body**, never a query parameter — which is what keeps an email
// or a phone number out of every access log and browser history entry between
// the operator and the API. The body type is exported so the caller names the
// wire shape at the transport seam instead of assembling a literal that would
// compile just as well with the value in the wrong field.
//
// Three enums cross as **values**, because the screen branches on each and a
// mistyped string literal is a comparison that is simply never true:
// `ResolveCustomerByContactBodyContactKind` (which kind the operator is
// submitting), `AdminNotificationIntentListStatus` (the screen asks the server
// for FAILED rather than downloading everything and filtering) and
// `NotificationReplayResponseOutcome` — the authoritative CREATED/EXISTING the
// replay states are keyed on, which exists precisely so a client never has to
// infer a duplicate from timing or a remembered id.
export {
  adminCustomerSupportResolve,
  adminCustomerSupportDetail,
  adminCustomerSupportGrants,
  adminSecureGrantRevoke,
  adminNotificationIntentList,
  adminNotificationIntentReplay,
} from './generated/embroidery-api';
export {
  ResolveCustomerByContactBodyContactKind,
  AdminCustomerContactResponseKind,
  AdminSecureGrantResponseStatus,
  AdminNotificationIntentListStatus,
  AdminNotificationIntentResponseStatus,
  AdminNotificationAttemptResponseOutcome,
  NotificationReplayResponseOutcome,
} from './generated/embroidery-api.schemas';
export type {
  ResolveCustomerByContactBody,
  AdminCustomerResolutionResponse,
  AdminCustomerDetailResponse,
  AdminCustomerContactResponse,
  AdminCustomerGrantsResponse,
  AdminSecureGrantResponse,
  RevokeSecureGrantBody,
  AdminNotificationIntentListParams,
  AdminNotificationIntentListResponse,
  AdminNotificationIntentResponse,
  AdminNotificationAttemptResponse,
  NotificationReplayResponse,
} from './generated/embroidery-api.schemas';

// APP5 public custom-request operations, released by their first consumer
// (`APP5-S01`). This boundary is consumer-driven: `APP5-B01`, `APP5-B02` and
// `APP5-B07` deliberately left their operations unexported, because an
// operation on this list is one a screen may reach.
//
// Four operations, and the set is bounded on purpose:
//
// - `publicProductVariantList` (`APP5-B07`) is the only public read that yields
//   a `productVariantId`. It publishes no SKU, price or stock and marks no
//   variant as a default, which is why the screen must make the customer choose
//   one rather than pick for them.
// - `publicCustomRequestAssetUpload` / `publicCustomRequestAssetStatus`
//   (`APP5-B02`) are challenge-scoped: neither addresses a request, a customer
//   or an asset that some other challenge uploaded.
// - `publicCustomRequestSubmit` (`APP5-B01`) creates the request.
//
// `publicCustomRequestStatus` (`APP5-B03`) was withheld by `APP5-S01` and is
// released below, by its own consumer, on its own terms.
//
// Two enums cross as **values** because the screen branches on both, and a
// mistyped string literal is a comparison that is simply never true:
// `PublicCustomRequestAssetUploadRole` (the two roles a customer may use —
// `ATTACHMENT` is internal and is not a member) and
// `CustomRequestAssetStatusResponseState` (which approved tile is drawn).
// `bindable`, not this enum, decides what may be submitted.
export {
  publicProductVariantList,
  publicCustomRequestAssetUpload,
  publicCustomRequestAssetStatus,
  publicCustomRequestSubmit,
} from './generated/embroidery-api';
export {
  PublicCustomRequestAssetUploadRole,
  CustomRequestAssetStatusResponseState,
} from './generated/embroidery-api.schemas';
export type {
  PublicProductVariantListResponse,
  PublicProductVariantResponse,
  CustomRequestAssetIntakeResponse,
  CustomRequestAssetStatusResponse,
  CustomRequestAssetBinding,
  CustomRequestCatalogSubject,
  CustomRequestCustomerOwnedProduct,
  CustomRequestQuantityLine,
  CustomRequestSubmissionResponse,
  SubmitCustomRequestBody,
} from './generated/embroidery-api.schemas';

// Grant-scoped custom-request status (`APP5-B03`), consumed by the Storefront
// request-status landing (`APP5-S02`). Exposed here so that feature never
// deep-imports the generated tree.
//
// It crosses **alone**, and the shape of the set is the architecture. B03
// already runs the whole APP4 authorization chain inside one call — policy,
// secure-link rate limiter, secure-link resolution, the exact request the grant
// names, then the customer-safe projection — so the Storefront resolves a
// secure link and reads a request in a single round trip. A client that called
// `publicSecureLinkResolve` first and B03 second would authorize the same token
// twice, spend the same abuse budget twice and hold the raw credential across
// two flights for no gain. `publicSecureLinkResolve` stays exported above
// because APP4 owns that contract, not because this screen chains it.
//
// The token travels in `ReadCustomRequestStatusBody` — a request **body**,
// never a path segment, query parameter or header — under the same
// `^[A-Za-z0-9_-]{43}$` shape `ResolveSecureLinkBody` publishes, which is what
// lets one fragment parser serve both and keeps a bearer credential out of
// every access log between the browser and the API. The body type is exported
// so the caller names the wire shape at the transport seam instead of
// assembling a literal that would compile just as well with the token in the
// wrong field.
//
// `CustomRequestStatusResponseStatus` crosses as a **value** because the screen
// branches on the lifecycle state and a mistyped string literal is a comparison
// that is simply never true. It publishes the **full** LC-11 enum, APP6+ states
// included, so a request that has moved past intake is still readable: the
// screen renders those neutrally rather than mapping them onto an APP5 state it
// would be inventing. `RequestAssetResponseRole` crosses for the same reason.
//
// The two subject kinds cross as values as well — `subject` is a union and the
// discriminant is what tells the two halves apart; comparing it to a hand-typed
// `'CATALOG'` is the one mistake that would silently render neither branch.
//
// No Admin APP5 operation is on this list. The queue, the request detail and
// the moderation transitions (`APP5-B04`, `APP5-B05`) belong to a different
// application and are released, if ever, by the Admin screens that consume them
// — see the Admin queue block below, which is exactly that release for one
// operation and no more.
export { publicCustomRequestStatus } from './generated/embroidery-api';
export {
  CustomRequestStatusResponseStatus,
  RequestAssetResponseRole,
  CatalogRequestSubjectResponseKind,
  CustomerOwnedRequestSubjectResponseKind,
} from './generated/embroidery-api.schemas';
export type {
  ReadCustomRequestStatusBody,
  CustomRequestStatusResponse,
  CatalogRequestSubjectResponse,
  CustomerOwnedRequestSubjectResponse,
  RequestQuantityLineResponse,
  RequestAssetResponse,
} from './generated/embroidery-api.schemas';

// Admin custom-request queue (`APP5-B04`), consumed by the Admin queue screen
// (`APP5-A01`). Released consumer-driven and one operation wide.
//
// `adminCustomRequest_list` crosses here for the queue. The detail read and the
// two `APP5-B05` moderation transitions were held back until a screen had an
// approved control for them — exporting an operation "for completeness" is how a
// read-only list ends up one careless import away from a state change. They are
// published in the `APP5-A02` block below, which is the checkpoint that owns
// those controls; the queue feature still imports only this one operation.
//
// The three enums cross as **values**, not types: the filter options and the
// status labels are derived from the contract rather than a hand-kept list that
// could drift out of step with what the server accepts. The status enums publish
// the **full** LC-11 set, APP6+ states included, because B04 answers a
// specifically requested `QUOTED` truthfully — the queue names such a state and
// offers no action in it, rather than folding it into an APP5 state it is not.
export { adminCustomRequestList } from './generated/embroidery-api';
export {
  AdminCustomRequestListStatusItem,
  AdminCustomRequestListSubjectKind,
  AdminCustomRequestQueueItemResponseStatus,
  AdminCustomRequestQueueItemResponseSubjectKind,
} from './generated/embroidery-api.schemas';
export type {
  AdminCustomRequestListParams,
  AdminCustomRequestQueueResponse,
  AdminCustomRequestQueueItemResponse,
  AdminCustomRequestQueueResponseAppliedStatusesItem,
} from './generated/embroidery-api.schemas';

// Admin custom-request detail and moderation (`APP5-B04`, `APP5-B05`,
// `APP5-B06`), consumed by the Admin request detail screen (`APP5-A02`).
//
// Four operations, released consumer-driven: the detail read, the private
// request-asset stream and the two moderation writes. `APP5-B06` deliberately
// left its curated export to this checkpoint rather than publishing an operation
// with no screen behind it.
//
// The two mutations cross **for the first time**. Until A02 there was no
// approved control for either, and the queue's boundary note said so explicitly.
// They stay together with the detail read on purpose: a moderation move is only
// legible next to the state it moves from, and A02 re-reads the detail after
// every one of them.
//
// `adminCustomRequestAssetGet` returns a `Blob` — the generated operation sets
// `responseType: 'blob'` itself, so no consumer configures transport to get it.
//
// The note and transition **body** types cross as types, and their kind/target
// enums as **values**: the dialogs derive the offered note kinds from the
// contract rather than from a hand-kept list that could accept a kind the server
// refuses. `AdminRequestModerationNoteResponseKind` publishes the full TBL-041
// set, `PAUSE` included, because a historical note may carry it and the history
// renders what is stored — the *dialogs* offer the narrower APP5 set.
export {
  adminCustomRequestDetail,
  adminCustomRequestAssetGet,
  adminCustomRequestAppendNote,
  adminCustomRequestTransition,
} from './generated/embroidery-api';
export {
  AdminCustomRequestDetailResponseStatus,
  AdminCatalogSubjectResponseKind,
  AdminCustomerOwnedSubjectResponseKind,
  AdminRequestAssetResponseRole,
  AdminRequestContactResponseKind,
  AdminRequestModerationNoteResponseKind,
  AppendModerationNoteBodyKind,
  TransitionCustomRequestBodyToStatus,
  TransitionCustomRequestBodyModerationNoteKind,
} from './generated/embroidery-api.schemas';
export type {
  AdminCustomRequestDetailResponse,
  AdminCatalogSubjectResponse,
  AdminCustomerOwnedSubjectResponse,
  AdminRequestAssetResponse,
  AdminRequestContactResponse,
  AdminRequestCustomerResponse,
  AdminRequestModerationNoteResponse,
  AdminRequestQuantityLineResponse,
  AdminRequestTransitionResponse,
  AppendModerationNoteBody,
  TransitionCustomRequestBody,
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
  AdminOrderQueueItemResponseStatus,
  AdminOrderDetailResponseStatus,
  AdminOrderItemResponseSubjectKind,
  AdminOrderPaymentsResponseOrderStatus,
  AdminOrderPaymentsResponseDepositStatus,
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
  AdminPaymentAttemptResponse,
  AdminPaymentEvidenceResponse,
  AdminPaymentReconciliationResponse,
  PaymentDecisionResponse,
  VerifyPaymentAttemptBody,
  ReviewPaymentAttemptBody,
} from './generated/embroidery-api.schemas';

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

// Generated transport types derived from the committed OpenAPI artifact.
export type {
  ApiErrorResponse,
  ApiFieldError,
  ApiPaginationMeta,
  ApiResponseMeta,
  ApiSuccessResponse,
  DatabaseHealthResponse,
  DatabasePoolResponse,
  HealthStatusResponse,
  ReadinessStatusResponse,
} from './generated/embroidery-api.schemas';
