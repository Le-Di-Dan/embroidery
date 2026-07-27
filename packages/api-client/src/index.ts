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
