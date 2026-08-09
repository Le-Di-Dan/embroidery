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
// `publicProductPlacementGet` stays withheld. It answers a deliberately
// narrower model — no `backgroundAssetId`, no retired rows and no concurrency
// token — and putting it on this boundary beside the Admin pair would invite an
// authoring screen to bind to it and silently lose the history the operator is
// meant to see.
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
// The lifecycle operations (`publish`, `unpublish`, `archive`) stay withheld:
// neither `APP3-A02` nor `APP3-A03` is lifecycle mutation, and an operation here
// is an invitation to add a button for it. `APP3-A04` brings them across.
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
