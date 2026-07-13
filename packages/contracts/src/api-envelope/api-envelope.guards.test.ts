import {
  isApiErrorResponse,
  isApiResponseEnvelope,
  isApiSuccessResponse,
} from './api-envelope.guards';
import type { ApiErrorResponse, ApiResponse, ApiSuccessResponse } from './api-envelope.types';

const meta = { requestId: 'req-1', timestamp: '2026-07-13T00:00:00.000Z' };

const successResponse: ApiSuccessResponse<{ id: string }> = {
  success: true,
  code: 'RESOURCE_FOUND',
  message: 'Resource retrieved successfully',
  data: { id: 'abc' },
  meta,
};

const errorResponse: ApiErrorResponse = {
  success: false,
  code: 'VALIDATION_ERROR',
  message: 'The request data is invalid',
  errors: [{ field: 'email', code: 'INVALID_EMAIL', message: 'Email is invalid' }],
  meta,
};

describe('isApiResponseEnvelope', () => {
  it('accepts a success envelope', () => {
    expect(isApiResponseEnvelope(successResponse)).toBe(true);
  });

  it('accepts an error envelope with and without field errors', () => {
    expect(isApiResponseEnvelope(errorResponse)).toBe(true);
    const { errors: _errors, ...withoutErrors } = errorResponse;
    expect(isApiResponseEnvelope(withoutErrors)).toBe(true);
  });

  it('accepts a success envelope with explicit null data', () => {
    expect(isApiResponseEnvelope({ ...successResponse, data: null })).toBe(true);
  });

  it('rejects non-object values', () => {
    expect(isApiResponseEnvelope(null)).toBe(false);
    expect(isApiResponseEnvelope(undefined)).toBe(false);
    expect(isApiResponseEnvelope('ok')).toBe(false);
    expect(isApiResponseEnvelope([successResponse])).toBe(false);
  });

  it('rejects objects missing required envelope fields', () => {
    expect(isApiResponseEnvelope({ success: true, data: {} })).toBe(false);
    const { meta: _meta, ...withoutMeta } = successResponse;
    expect(isApiResponseEnvelope(withoutMeta)).toBe(false);
    const { data: _data, ...withoutData } = successResponse;
    expect(isApiResponseEnvelope(withoutData)).toBe(false);
  });

  it('rejects an error envelope whose errors field is not an array', () => {
    expect(isApiResponseEnvelope({ ...errorResponse, errors: 'broken' })).toBe(false);
  });
});

describe('success/error narrowing', () => {
  it('narrows a success response and exposes data', () => {
    const response: ApiResponse<{ id: string }> = successResponse;
    expect(isApiSuccessResponse(response)).toBe(true);
    if (isApiSuccessResponse(response)) {
      expect(response.data.id).toBe('abc');
    }
  });

  it('narrows an error response and exposes structured errors', () => {
    const response: ApiResponse<{ id: string }> = errorResponse;
    expect(isApiErrorResponse(response)).toBe(true);
    if (isApiErrorResponse(response)) {
      expect(response.errors?.[0]?.code).toBe('INVALID_EMAIL');
    }
  });

  it('keeps the two guards mutually exclusive', () => {
    expect(isApiSuccessResponse(errorResponse)).toBe(false);
    expect(isApiErrorResponse(successResponse)).toBe(false);
  });
});
