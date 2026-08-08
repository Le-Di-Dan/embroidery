/**
 * Publishes the P01 Design Document as OpenAPI components (`APP3-B08-C1`).
 *
 * `APP3-B08` shipped the autosave body with its `document` field as an open
 * object, on the reasoning that mirroring `@embroidery/design-document` at the
 * HTTP edge would create a second definition that drifts. The reasoning was
 * right and the result was wrong: an open object is not a contract, and a
 * generated client typed it as an unbounded map.
 *
 * This resolves both. The schema is **generated from P01's own TypeScript
 * types** and imported here as data; nothing below names a field, a variant or
 * a property of the Design Document. What this file does is purely
 * representational — translate one dialect into another:
 *
 *   - `#/definitions/X` → `#/components/schemas/X`, because OpenAPI keeps
 *     component schemas somewhere else;
 *   - `const: v` → `enum: [v]`, because the document is OpenAPI **3.0.0**, and
 *     `const` is a JSON Schema draft-07 keyword 3.0 does not define. Dropping
 *     it would erase the discriminator that makes the element union readable.
 *
 * Both rewrites are structural: they are applied by walking the tree, never by
 * enumerating the shape. If P01 gains an element kind tomorrow, it appears here
 * with no edit to this file.
 *
 * What is deliberately *not* translated is P01's runtime semantics — NFC
 * normalization, non-empty strings, non-zero scale factors, the `fontSizePx`
 * range, integer `fontWeight`, the 2..5000 freehand point bound. TypeScript
 * does not express them, so the generator cannot derive them, and writing them
 * in by hand is precisely the duplication this design avoids. The published
 * schema is the structural contract; P01 stays the acceptance authority.
 */
import {
  DESIGN_DOCUMENT_JSON_SCHEMA,
  DESIGN_DOCUMENT_SCHEMA_ROOT_TYPE,
} from '@embroidery/design-document';
import { type OpenAPIObject } from '@nestjs/swagger';

/** The component every Design Document reference resolves to. */
export const DESIGN_DOCUMENT_SCHEMA_NAME = DESIGN_DOCUMENT_SCHEMA_ROOT_TYPE;

export const DESIGN_DOCUMENT_SCHEMA_REF = `#/components/schemas/${DESIGN_DOCUMENT_SCHEMA_NAME}`;

/**
 * The opt-in marker a schema-backed body sets to publish a generated component.
 *
 * A vendor extension rather than a hard-coded operation id, so this file never
 * learns which endpoints carry a Design Document. `APP3-B08` sets it on its
 * `document` field; a future body does the same and needs no change here.
 */
export const PUBLISHED_SCHEMA_MARKER = 'x-embroidery-published-schema';

const DEFINITIONS_PREFIX = '#/definitions/';
const COMPONENTS_PREFIX = '#/components/schemas/';

/** Keys that describe the JSON Schema document itself, not the shape. */
const DOCUMENT_LEVEL_KEYS = new Set(['$schema', '$comment', '$id']);

/**
 * Rewrites one node into the OpenAPI 3.0 dialect.
 *
 * Recursive and key-agnostic on purpose: it reacts to `$ref` and `const`
 * wherever they appear, so no part of it knows what a Design Document contains.
 */
function toOpenApiDialect(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => toOpenApiDialect(entry));
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (DOCUMENT_LEVEL_KEYS.has(key)) continue;

    if (key === '$ref' && typeof value === 'string' && value.startsWith(DEFINITIONS_PREFIX)) {
      result[key] = `${COMPONENTS_PREFIX}${value.slice(DEFINITIONS_PREFIX.length)}`;
      continue;
    }
    if (key === 'const') {
      // 3.0 has no `const`; a single-member `enum` is the exact equivalent and
      // is what keeps each element variant discriminable.
      result['enum'] = [value];
      continue;
    }
    result[key] = toOpenApiDialect(value);
  }
  return result;
}

/** Every P01 definition, as OpenAPI component schemas. */
export function buildDesignDocumentSchemas(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(DESIGN_DOCUMENT_JSON_SCHEMA.definitions)) {
    schemas[name] = toOpenApiDialect(definition);
  }
  return schemas;
}

/**
 * Replaces every marked node with a reference to the component it names.
 *
 * The marker arrives from a Zod `.meta()` call, so by the time the document is
 * built it is an ordinary property on the emitted schema. Left in place it would
 * publish as a stray vendor extension on an open object — the field would still
 * describe nothing, and the extension would leak into the generated client.
 *
 * The node is replaced by `allOf: [$ref]` rather than a bare `$ref` so the
 * field's own description survives. OpenAPI 3.0 ignores siblings of `$ref`, so a
 * bare reference would silently discard it; the single-member `allOf` is the
 * standard idiom for annotating a reference and is what the envelope
 * augmentation already uses.
 */
function resolveMarkedReferences(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => resolveMarkedReferences(entry));
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const record = node as Record<string, unknown>;
  const marker = record[PUBLISHED_SCHEMA_MARKER];
  if (typeof marker === 'string') {
    const description = record['description'];
    return {
      allOf: [{ $ref: `${COMPONENTS_PREFIX}${marker}` }],
      ...(typeof description === 'string' ? { description } : {}),
    };
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveMarkedReferences(value);
  }
  return result;
}

/**
 * Adds the Design Document components and resolves every reference to them.
 *
 * Both halves in one pass on purpose. A marker resolved to a component that was
 * never registered is a broken document, and registering components nothing
 * references is dead weight; splitting them into two calls is how a later edit
 * ends up doing one and not the other.
 *
 * Existing components win on a name collision. The generated names are P01's own
 * exported type names, and silently overwriting an unrelated schema that happens
 * to share one would be a far worse failure than publishing nothing — the gate
 * asserts the root is present, so a collision that suppressed it is caught.
 */
export function applyDesignDocumentSchemas(document: OpenAPIObject): OpenAPIObject {
  const components = document.components ?? {};
  const existing = components.schemas ?? {};
  // Mutates and returns, matching `applyEnvelopeSchemas`: the pipeline calls
  // these for effect and discards the result, so returning a fresh document
  // would silently do nothing.
  document.components = {
    ...components,
    schemas: {
      ...(buildDesignDocumentSchemas() as typeof existing),
      ...existing,
    },
  };
  // Both trees, because a marker can be in either. `APP3-B08`'s is in
  // `components.schemas` — its body is a registered DTO, so the marked field
  // travels with the component rather than inline under the path — but a body
  // published inline would put one under `paths`, and a rule that only looked
  // where today's single caller happens to be is a rule that breaks silently.
  document.paths = resolveMarkedReferences(document.paths) as OpenAPIObject['paths'];
  document.components.schemas = resolveMarkedReferences(
    document.components.schemas,
  ) as typeof existing;
  return document;
}
