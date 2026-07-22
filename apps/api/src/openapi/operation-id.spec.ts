import { type OpenAPIObject } from '@nestjs/swagger';

import { OPERATION_ID_PATTERN, createOperationId, validateOperationIds } from './operation-id';

function documentWith(paths: Record<string, unknown>): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 'test', version: '0.0.0' },
    paths: paths as OpenAPIObject['paths'],
  };
}

describe('createOperationId', () => {
  it('derives a domain key from the controller class name', () => {
    expect(createOperationId('HealthController', 'check')).toBe('health_check');
  });

  it('keeps multi-word controller names codegen-friendly', () => {
    expect(createOperationId('CustomRequestController', 'listAll')).toBe('customRequest_listAll');
  });

  it('is stable across repeated calls and independent of call order', () => {
    const first = createOperationId('HealthController', 'readiness');
    const second = createOperationId('HealthController', 'readiness');
    expect(first).toBe(second);
    expect(first).toMatch(OPERATION_ID_PATTERN);
  });

  it('rejects input it cannot derive a stable id from', () => {
    expect(() => createOperationId('Controller', 'check')).toThrow(/Cannot derive/);
    expect(() => createOperationId('HealthController', '')).toThrow(/Cannot derive/);
  });
});

describe('validateOperationIds', () => {
  it('accepts a document whose operations all carry a valid unique id', () => {
    const document = documentWith({
      '/api/health': { get: { operationId: 'health_check' } },
      '/api/health/readiness': { get: { operationId: 'health_readiness' } },
    });
    expect(() => validateOperationIds(document)).not.toThrow();
  });

  it('rejects a duplicate id and names both operations', () => {
    const document = documentWith({
      '/api/health': { get: { operationId: 'health_check' } },
      '/api/other': { post: { operationId: 'health_check' } },
    });
    expect(() => validateOperationIds(document)).toThrow(
      /Duplicate operationId "health_check" on GET \/api\/health and POST \/api\/other/,
    );
  });

  it('rejects a missing id', () => {
    const document = documentWith({ '/api/health': { get: { summary: 'no id' } } });
    expect(() => validateOperationIds(document)).toThrow(
      /Operation GET \/api\/health is missing an operationId/,
    );
  });

  it('rejects a malformed id', () => {
    const document = documentWith({ '/api/health': { get: { operationId: 'Health Check' } } });
    expect(() => validateOperationIds(document)).toThrow(/invalid operationId "Health Check"/);
  });

  it('ignores path-item keys that are not HTTP methods', () => {
    const document = documentWith({
      '/api/health': {
        parameters: [{ name: 'trace', in: 'query' }],
        summary: 'health',
        get: { operationId: 'health_check' },
      },
    });
    expect(() => validateOperationIds(document)).not.toThrow();
  });
});
