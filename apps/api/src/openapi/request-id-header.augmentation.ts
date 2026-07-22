import { type OpenAPIObject } from '@nestjs/swagger';

import {
  REQUEST_ID_HEADER,
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_MIN_LENGTH,
  REQUEST_ID_PATTERN_SOURCE,
} from '../platform/request-context/request-id.contract';

/**
 * Documents the request-ID HTTP contract on every operation (APP0-B02).
 *
 * Applied as one document-wide transform rather than a decorator on each
 * handler: the contract is global, and per-controller decorators would drift
 * the moment someone adds an endpoint and forgets one.
 */

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

/** Shared schema for both the request parameter and the response header. */
function requestIdSchema(): Record<string, unknown> {
  return {
    type: 'string',
    pattern: REQUEST_ID_PATTERN_SOURCE,
    minLength: REQUEST_ID_MIN_LENGTH,
    maxLength: REQUEST_ID_MAX_LENGTH,
  };
}

const REQUEST_PARAMETER_DESCRIPTION =
  'Optional client-supplied correlation ID. A value matching the pattern is ' +
  'preserved end to end; anything missing or outside it is replaced by a ' +
  'safe generated ID and is never echoed back.';

const RESPONSE_HEADER_DESCRIPTION =
  'The effective correlation ID for this request, set by the gateway. Quote it ' +
  'when reporting a problem so the request can be found in the logs.';

interface MutableOperation {
  parameters?: unknown[];
  responses?: Record<string, { headers?: Record<string, unknown> } | undefined>;
}

/**
 * Returns a new document with the `X-Request-ID` request parameter and response
 * header added to every operation. Mutates nothing the caller owns beyond the
 * operation objects Swagger has just produced for this build.
 */
export function applyRequestIdHeaderContract(document: OpenAPIObject): OpenAPIObject {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHOD_KEYS.has(method) || operation === null || typeof operation !== 'object') {
        continue;
      }
      documentOperation(operation as MutableOperation);
    }
  }
  return document;
}

function documentOperation(operation: MutableOperation): void {
  const parameters = operation.parameters ?? [];
  parameters.push({
    name: REQUEST_ID_HEADER,
    in: 'header',
    required: false,
    description: REQUEST_PARAMETER_DESCRIPTION,
    schema: requestIdSchema(),
  });
  operation.parameters = parameters;

  for (const response of Object.values(operation.responses ?? {})) {
    if (response === undefined || response === null) {
      continue;
    }
    const headers = response.headers ?? {};
    headers[REQUEST_ID_HEADER] = {
      description: RESPONSE_HEADER_DESCRIPTION,
      schema: requestIdSchema(),
    };
    response.headers = headers;
  }
}
