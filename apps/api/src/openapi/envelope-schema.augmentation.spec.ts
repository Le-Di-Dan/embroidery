import { type OpenAPIObject } from '@nestjs/swagger';

import { API_ERROR_CODE } from '../platform/http-response/api-error-code';
import {
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_MIN_LENGTH,
  REQUEST_ID_PATTERN_SOURCE,
} from '../platform/request-context/request-id.contract';
import { ENVELOPE_SCHEMA_NAMES, applyEnvelopeSchemas } from './envelope-schema.augmentation';

function documentWith(paths: Record<string, unknown>): OpenAPIObject {
  return { openapi: '3.0.0', info: { title: 't', version: '1' }, paths } as OpenAPIObject;
}

function schemasOf(document: OpenAPIObject): Record<string, Record<string, unknown>> {
  return (document.components?.schemas ?? {}) as Record<string, Record<string, unknown>>;
}

describe('applyEnvelopeSchemas', () => {
  it('registers every reusable envelope component', () => {
    const document = documentWith({});

    applyEnvelopeSchemas(document);

    for (const name of Object.values(ENVELOPE_SCHEMA_NAMES)) {
      expect(schemasOf(document)[name]).toBeDefined();
    }
  });

  it('preserves schemas Swagger already generated', () => {
    const document = documentWith({});
    document.components = { schemas: { HealthStatusResponse: { type: 'object' } } };

    applyEnvelopeSchemas(document);

    expect(schemasOf(document)['HealthStatusResponse']).toEqual({ type: 'object' });
    expect(schemasOf(document)[ENVELOPE_SCHEMA_NAMES.success]).toBeDefined();
  });

  it('uses the B02 request-ID contract for meta.requestId', () => {
    const document = documentWith({});

    applyEnvelopeSchemas(document);

    const meta = schemasOf(document)[ENVELOPE_SCHEMA_NAMES.meta];
    const requestId = (meta?.['properties'] as Record<string, Record<string, unknown>>)[
      'requestId'
    ];

    expect(requestId).toMatchObject({
      type: 'string',
      pattern: REQUEST_ID_PATTERN_SOURCE,
      minLength: REQUEST_ID_MIN_LENGTH,
      maxLength: REQUEST_ID_MAX_LENGTH,
    });
  });

  it('requires requestId and timestamp on meta', () => {
    const document = documentWith({});

    applyEnvelopeSchemas(document);

    expect(schemasOf(document)[ENVELOPE_SCHEMA_NAMES.meta]?.['required']).toEqual([
      'requestId',
      'timestamp',
    ]);
  });

  it('matches the canonical success and error field sets', () => {
    const document = documentWith({});

    applyEnvelopeSchemas(document);

    expect(schemasOf(document)[ENVELOPE_SCHEMA_NAMES.success]?.['required']).toEqual([
      'success',
      'code',
      'message',
      'data',
      'meta',
    ]);
    expect(schemasOf(document)[ENVELOPE_SCHEMA_NAMES.error]?.['required']).toEqual([
      'success',
      'code',
      'message',
      'meta',
    ]);
  });

  it('publishes only the platform error codes', () => {
    const document = documentWith({});

    applyEnvelopeSchemas(document);

    const error = schemasOf(document)[ENVELOPE_SCHEMA_NAMES.error];
    const code = (error?.['properties'] as Record<string, Record<string, unknown>>)['code'];

    expect(code?.['enum']).toEqual(Object.values(API_ERROR_CODE));
  });

  it('documents a 500 error envelope on every operation', () => {
    const document = documentWith({
      '/api/a': { get: { responses: { '200': {} } }, post: { responses: { '201': {} } } },
    });

    applyEnvelopeSchemas(document);

    for (const operation of Object.values(document.paths['/api/a'] as Record<string, unknown>)) {
      const responses = (operation as { responses: Record<string, unknown> }).responses;
      expect(responses['500']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` },
          },
        },
      });
    }
  });

  it('leaves an operation-declared 500 untouched', () => {
    const declared = { description: 'Endpoint-specific failure' };
    const document = documentWith({ '/api/a': { get: { responses: { '500': declared } } } });

    applyEnvelopeSchemas(document);

    expect(
      (document.paths['/api/a'] as { get: { responses: Record<string, unknown> } }).get.responses[
        '500'
      ],
    ).toBe(declared);
  });

  it('does not claim success responses are enveloped', () => {
    // Endpoints may opt out (health does), so the transform must not rewrite 2xx.
    const original = { description: 'Raw operational body' };
    const document = documentWith({ '/api/health': { get: { responses: { '200': original } } } });

    applyEnvelopeSchemas(document);

    expect(
      (document.paths['/api/health'] as { get: { responses: Record<string, unknown> } }).get
        .responses['200'],
    ).toBe(original);
  });

  it('emits no timestamp, host or filesystem path', () => {
    const document = documentWith({ '/api/a': { get: { responses: { '200': {} } } } });

    applyEnvelopeSchemas(document);

    const serialised = JSON.stringify(document);
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(serialised).not.toContain('localhost');
    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it('is deterministic across repeated builds', () => {
    const build = (): string => {
      const document = documentWith({ '/api/a': { get: { responses: { '200': {} } } } });
      applyEnvelopeSchemas(document);
      return JSON.stringify(document);
    };

    expect(build()).toBe(build());
  });
});
