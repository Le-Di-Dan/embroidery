/**
 * The transport itself: how a call is configured, made and injected, how its
 * failure is normalized, and the envelope types every response is wrapped in.
 *
 * Nothing here belongs to a product domain. The client factories, the per-call
 * options that carry a repository-owned Axios instance, the error normalizer and
 * the envelope types are what every other barrel in this folder is built on, and
 * the health operations are the only calls that answer before any domain exists.
 *
 * It is re-exported first from the root barrel for that reason.
 */

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
