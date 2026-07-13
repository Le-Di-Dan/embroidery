import type {
  ApiErrorResponse,
  ApiFieldError,
  ApiResponse,
  ApiResponseMeta,
  ApiSuccessResponse,
} from './api-envelope.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasEnvelopeShape(value: Record<string, unknown>): boolean {
  return (
    typeof value['success'] === 'boolean' &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    isRecord(value['meta'])
  );
}

/**
 * Structural check for unknown payloads at the transport boundary.
 * Success envelopes must carry `data`; error envelopes must not carry `data`.
 */
export function isApiResponseEnvelope(value: unknown): value is ApiResponse<unknown> {
  if (!isRecord(value) || !hasEnvelopeShape(value)) {
    return false;
  }
  if (value['success'] === true) {
    return 'data' in value;
  }
  return value['errors'] === undefined || Array.isArray(value['errors']);
}

export function isApiSuccessResponse<TData, TMeta = ApiResponseMeta, TError = ApiFieldError>(
  response: ApiResponse<TData, TMeta, TError>,
): response is ApiSuccessResponse<TData, TMeta> {
  return response.success;
}

export function isApiErrorResponse<TData, TMeta = ApiResponseMeta, TError = ApiFieldError>(
  response: ApiResponse<TData, TMeta, TError>,
): response is ApiErrorResponse<TError> {
  return !response.success;
}
