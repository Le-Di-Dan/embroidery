import { getSchemaPath, type OpenAPIObject } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { API_ERROR_CODE, INTERNAL_ERROR_MESSAGE } from '../platform/http-response/api-error-code';
import {
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_MIN_LENGTH,
  REQUEST_ID_PATTERN_SOURCE,
} from '../platform/request-context/request-id.contract';

/**
 * Publishes the canonical envelope as reusable OpenAPI components (APP0-B03).
 *
 * Written as a document transform rather than decorated DTO classes because the
 * envelope is generic over `data`: a class per payload type would multiply with
 * every future endpoint, while `ApiSuccessResponse` here is the reusable base a
 * feature response composes with `allOf`.
 *
 * Every value is a constant. No example timestamp, host or path is emitted —
 * the artifact must be byte-identical on every machine.
 */

type SchemaMap = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>;

export const ENVELOPE_SCHEMA_NAMES = {
  meta: 'ApiResponseMeta',
  pagination: 'ApiPaginationMeta',
  fieldError: 'ApiFieldError',
  success: 'ApiSuccessResponse',
  error: 'ApiErrorResponse',
} as const;

/**
 * The published shape of one successful envelope carrying `model` as its data
 * (`APP3-P04`).
 *
 * Lives beside the envelope names rather than in a controller because it is the
 * same three lines for every schema-backed success response in the API, and a
 * copy per controller is how one of them ends up referencing the wrong envelope
 * or forgetting `data` is required. `APP3-B06B` still carries its own local
 * copy; it is left alone here because its gate is outside this foundation's
 * budget, and folding it in is a follow-up rather than a silent edit.
 */
export function envelopeSchemaOf(model: Parameters<typeof getSchemaPath>[0]): SchemaObject {
  return {
    allOf: [
      { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.success}` },
      { type: 'object', required: ['data'], properties: { data: { $ref: getSchemaPath(model) } } },
    ],
  };
}

const requestIdSchema = {
  type: 'string',
  pattern: REQUEST_ID_PATTERN_SOURCE,
  minLength: REQUEST_ID_MIN_LENGTH,
  maxLength: REQUEST_ID_MAX_LENGTH,
  description: 'Correlation ID for this request; matches the gateway X-Request-ID.',
};

function buildSchemas(): Record<string, unknown> {
  return {
    [ENVELOPE_SCHEMA_NAMES.pagination]: {
      type: 'object',
      required: ['page', 'pageSize', 'totalItems', 'totalPages'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1 },
        totalItems: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 0 },
      },
    },
    [ENVELOPE_SCHEMA_NAMES.meta]: {
      type: 'object',
      required: ['requestId', 'timestamp'],
      properties: {
        requestId: requestIdSchema,
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 UTC timestamp of the response.',
        },
        pagination: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.pagination}` },
      },
    },
    [ENVELOPE_SCHEMA_NAMES.fieldError]: {
      type: 'object',
      required: ['field', 'code', 'message'],
      properties: {
        field: { type: 'string', description: 'Empty when the detail is not field-specific.' },
        code: { type: 'string', description: 'Stable machine-readable code; branch on this.' },
        message: { type: 'string', description: 'Human-readable text; never branch on this.' },
      },
    },
    [ENVELOPE_SCHEMA_NAMES.success]: {
      type: 'object',
      description:
        'Canonical success envelope (D-034). Endpoint responses compose this with ' +
        'their own payload schema for `data`.',
      required: ['success', 'code', 'message', 'data', 'meta'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        code: { type: 'string', description: 'Stable machine-readable code; branch on this.' },
        message: { type: 'string', description: 'Human-readable text; never branch on this.' },
        data: {
          nullable: true,
          description: 'Endpoint payload; null where the contract has no payload.',
        },
        meta: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.meta}` },
      },
    },
    [ENVELOPE_SCHEMA_NAMES.error]: {
      type: 'object',
      description:
        'Canonical error envelope (D-034). Server faults always carry the generic ' +
        'message; internal detail is never published.',
      required: ['success', 'code', 'message', 'meta'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        code: {
          type: 'string',
          description: 'Stable machine-readable code; branch on this.',
          enum: Object.values(API_ERROR_CODE),
        },
        message: { type: 'string', description: 'Human-readable text; never branch on this.' },
        errors: {
          type: 'array',
          items: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.fieldError}` },
          description: 'Structured validation or domain details, when safe to publish.',
        },
        meta: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.meta}` },
      },
    },
  };
}

const HTTP_METHOD_KEYS: ReadonlySet<string> = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

const INTERNAL_ERROR_STATUS = '500';

/**
 * Registers the reusable schemas and documents the one response every operation
 * can produce: the global exception filter maps any unhandled failure to a 500
 * error envelope, including on endpoints whose success body opts out.
 */
export function applyEnvelopeSchemas(document: OpenAPIObject): OpenAPIObject {
  const components = document.components ?? {};
  document.components = {
    ...components,
    // These are hand-authored OpenAPI fragments. Swagger's `SchemaObject` types
    // string literals such as `type: 'object'` as narrow unions that an object
    // literal widens to `string`, so one cast at the boundary is unavoidable;
    // the shapes themselves are asserted by this module's tests and by the
    // committed artifact.
    schemas: { ...components.schemas, ...(buildSchemas() as SchemaMap) },
  };

  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHOD_KEYS.has(method) || operation === null || typeof operation !== 'object') {
        continue;
      }
      const responses = (operation as { responses?: Record<string, unknown> }).responses ?? {};
      if (responses[INTERNAL_ERROR_STATUS] === undefined) {
        responses[INTERNAL_ERROR_STATUS] = {
          description: INTERNAL_ERROR_MESSAGE,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${ENVELOPE_SCHEMA_NAMES.error}` },
            },
          },
        };
      }
      (operation as { responses?: Record<string, unknown> }).responses = responses;
    }
  }

  return document;
}
