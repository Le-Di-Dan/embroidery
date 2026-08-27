/**
 * Customer-owned products and custom requests (`APP5`): the public submission
 * and intake surface, the grant-scoped status read, and the Admin queue, detail
 * and moderation operations.
 *
 * The public and Admin halves stay together because the boundary between them is
 * the point — what a customer may submit and read about their own request is
 * defined by exactly what the Admin side may see and move, and separating the
 * two would make that correspondence invisible.
 *
 * The grant-scoped status read crosses **alone** among the public operations,
 * and its comment below explains why the shape of that set is the architecture.
 */

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
