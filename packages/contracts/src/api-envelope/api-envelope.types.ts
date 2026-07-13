/**
 * Standard response envelope for all internal JSON business APIs (D-034).
 *
 * Controlled exceptions (health endpoints, binary streams, redirects,
 * third-party webhook contracts) are defined in
 * docs/development/BACKEND_CONVENTIONS.md §6.
 */

export interface ApiPaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiResponseMeta {
  requestId: string;
  /** ISO-8601 UTC timestamp of the response. */
  timestamp: string;
  pagination?: ApiPaginationMeta;
}

export interface ApiFieldError {
  field: string;
  /** Stable machine-readable code; clients branch on this, never on `message`. */
  code: string;
  message: string;
}

export interface ApiSuccessResponse<TData, TMeta = ApiResponseMeta> {
  success: true;
  /** Stable machine-readable code; clients branch on this, never on `message`. */
  code: string;
  message: string;
  data: TData;
  meta: TMeta;
}

export interface ApiErrorResponse<TError = ApiFieldError> {
  success: false;
  /** Stable machine-readable code; clients branch on this, never on `message`. */
  code: string;
  message: string;
  errors?: TError[];
  meta: ApiResponseMeta;
}

export type ApiResponse<TData, TMeta = ApiResponseMeta, TError = ApiFieldError> =
  ApiSuccessResponse<TData, TMeta> | ApiErrorResponse<TError>;
