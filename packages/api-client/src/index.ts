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

// Admin product read operation (APP2-B02), exposed for the read-only Admin
// Product List (`APP2-A02`). Only the list operation crosses this boundary:
// create, detail, update and archive belong to `APP2-A03`/`APP2-A04` and are
// deliberately not re-exported, so no screen can reach a mutation before the
// checkpoint that owns it ships. The two query enums are re-exported as values
// so the filter options are derived from the contract rather than hard-coded.
// Admin product read + draft-authoring operations (APP2-B02). `adminProductList`
// serves the read-only list (`APP2-A02`); create, detail and update serve the
// product form/detail capability (`APP2-A03`).
//
// Still deliberately withheld: `adminProductArchive`, which has no approved
// surface (`FU-APP2-PRODUCT-ARCHIVE-UI-01`), and the three publication
// operations `adminProductPublicationReadiness`/`adminProductPublish`/
// `adminProductUnpublish` delivered by `APP2-B03`. The publication operations
// exist in the generated tree and are covered by the contract; the screen that
// uses them is `APP2-A04`, and that checkpoint exposes them here. Withholding
// them keeps a mutation unreachable from any screen before the checkpoint that
// owns its interaction, confirmation and error states has shipped.
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
