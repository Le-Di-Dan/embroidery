import { type INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { GLOBAL_ROUTE_PREFIX } from '../bootstrap/api-application';
import { applyEnvelopeSchemas } from './envelope-schema.augmentation';
import { buildOpenApiConfig } from './openapi-document.config';
import { createOperationId, validateOperationIds } from './operation-id';
import { applyRequestIdHeaderContract } from './request-id-header.augmentation';

/** HTTP method keys used when counting operations for the generation summary. */
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

export interface DocumentStats {
  readonly pathCount: number;
  readonly operationCount: number;
  readonly schemaCount: number;
}

/**
 * Builds the canonical OpenAPI document from the running application metadata
 * (APP0-B01). This single builder is shared by the generator CLI and the
 * runtime Swagger UI so the served document and the committed artifact are
 * produced identically.
 *
 * `ignoreGlobalPrefix` keeps NestJS from prepending the prefix so the outcome
 * does not depend on Swagger's evolving prefix handling; the prefix is then
 * applied here explicitly, guaranteeing documented paths such as `/api/health`
 * match the runtime routing contract.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig(), {
    operationIdFactory: createOperationId,
    ignoreGlobalPrefix: true,
  });
  const prefixed = applyGlobalPrefixToPaths(document, GLOBAL_ROUTE_PREFIX);
  // Envelope schemas first: the 500 response it documents must also receive the
  // request-ID response header the next transform adds to every response.
  applyEnvelopeSchemas(prefixed);
  applyRequestIdHeaderContract(prefixed);
  validateOperationIds(prefixed);
  return prefixed;
}

/** Prepends the global route prefix to every documented path key. */
export function applyGlobalPrefixToPaths(document: OpenAPIObject, prefix: string): OpenAPIObject {
  if (document.paths === undefined) {
    return document;
  }
  const normalized = prefix.replace(/^\/+|\/+$/g, '');
  const paths: Record<string, unknown> = {};
  for (const [path, pathItem] of Object.entries(document.paths)) {
    paths[`/${normalized}${path}`] = pathItem;
  }
  return { ...document, paths: paths as OpenAPIObject['paths'] };
}

/** Summarizes a document for the generation/check CLI output. */
export function describeDocument(document: OpenAPIObject): DocumentStats {
  const pathEntries = Object.entries(document.paths ?? {});
  let operationCount = 0;
  for (const [, pathItem] of pathEntries) {
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHOD_KEYS.has(method)) {
        operationCount += 1;
      }
    }
  }
  return {
    pathCount: pathEntries.length,
    operationCount,
    schemaCount: Object.keys(document.components?.schemas ?? {}).length,
  };
}
