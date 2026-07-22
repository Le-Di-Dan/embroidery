import { type OpenAPIObject } from '@nestjs/swagger';

import {
  REQUEST_ID_HEADER,
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_MIN_LENGTH,
  REQUEST_ID_PATTERN_SOURCE,
} from '../platform/request-context/request-id.contract';
import { applyRequestIdHeaderContract } from './request-id-header.augmentation';

function documentWith(paths: Record<string, unknown>): OpenAPIObject {
  return { openapi: '3.0.0', info: { title: 't', version: '1' }, paths } as OpenAPIObject;
}

const expectedSchema = {
  type: 'string',
  pattern: REQUEST_ID_PATTERN_SOURCE,
  minLength: REQUEST_ID_MIN_LENGTH,
  maxLength: REQUEST_ID_MAX_LENGTH,
};

describe('applyRequestIdHeaderContract', () => {
  it('documents the request header on every operation of every path', () => {
    const document = documentWith({
      '/api/a': { get: { responses: { '200': {} } }, post: { responses: { '201': {} } } },
      '/api/b': { get: { responses: { '200': {} } } },
    });

    applyRequestIdHeaderContract(document);

    for (const [, pathItem] of Object.entries(document.paths)) {
      for (const operation of Object.values(pathItem) as { parameters?: unknown[] }[]) {
        const parameter = operation.parameters?.[0] as Record<string, unknown> | undefined;
        expect(parameter).toMatchObject({
          name: REQUEST_ID_HEADER,
          in: 'header',
          required: false,
          schema: expectedSchema,
        });
      }
    }
  });

  it('documents the response header on every documented status', () => {
    const document = documentWith({
      '/api/a': { get: { responses: { '200': {}, '503': {} } } },
    });

    applyRequestIdHeaderContract(document);

    const responses = (
      document.paths['/api/a'] as { get: { responses: Record<string, { headers?: unknown }> } }
    ).get.responses;

    for (const status of ['200', '503']) {
      expect(
        (responses[status]?.headers as Record<string, unknown>)[REQUEST_ID_HEADER],
      ).toMatchObject({ schema: expectedSchema });
    }
  });

  it('preserves parameters an operation already declares', () => {
    const existing = { name: 'id', in: 'path', required: true };
    const document = documentWith({
      '/api/a/{id}': { get: { parameters: [existing], responses: { '200': {} } } },
    });

    applyRequestIdHeaderContract(document);

    const parameters = (document.paths['/api/a/{id}'] as { get: { parameters: unknown[] } }).get
      .parameters;
    expect(parameters).toHaveLength(2);
    expect(parameters[0]).toBe(existing);
  });

  it('ignores non-operation keys on a path item', () => {
    const document = documentWith({
      '/api/a': { summary: 'not an operation', get: { responses: { '200': {} } } },
    });

    expect(() => applyRequestIdHeaderContract(document)).not.toThrow();
    expect((document.paths['/api/a'] as Record<string, unknown>)['summary']).toBe(
      'not an operation',
    );
  });

  it('adds no alternative correlation header name', () => {
    const document = documentWith({ '/api/a': { get: { responses: { '200': {} } } } });

    applyRequestIdHeaderContract(document);

    const serialised = JSON.stringify(document);
    expect(serialised).not.toMatch(/X-Correlation-ID/i);
    expect(serialised).not.toMatch(/X-Trace-ID/i);
  });
});
