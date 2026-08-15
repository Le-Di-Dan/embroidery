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
