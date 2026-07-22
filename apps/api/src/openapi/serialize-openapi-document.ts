import { type OpenAPIObject } from '@nestjs/swagger';

/**
 * Deterministically serializes an OpenAPI document (APP0-B01).
 *
 * Object keys are sorted recursively so the byte output does not depend on
 * insertion order (key order is not semantically significant in OpenAPI), while
 * array order is preserved. The result uses two-space indentation, LF line
 * endings, and a trailing newline, giving a stable artifact suitable for a
 * drift check. NestJS Swagger emits no timestamps, hosts, or random ids, so no
 * field stripping is required.
 */
export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(sortValue(document), null, 2)}\n`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}
