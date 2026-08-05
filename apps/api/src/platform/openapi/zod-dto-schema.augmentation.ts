/**
 * Publishes the real schema of every schema-backed request body (`APP3-P03`).
 *
 * `createZodDto` gives `@nestjs/swagger` a class with no decorated properties,
 * so Swagger — which documents a class by reading `@ApiProperty` metadata off
 * it — correctly concluded there was nothing to document and emitted
 * `{ "type": "object", "properties": {} }`. Runtime validation was never
 * affected; the *published contract* was. A client reading the document could
 * not see that `expectedUpdatedAt` exists, and the generated client typed every
 * such body as an empty object.
 *
 * This augmentation replaces each of those components with the schema converted
 * from the Zod schema that actually validates the request, and then refuses to
 * emit a document in which any request body is still empty. That refusal is the
 * point: a fix that repairs the six known bodies but silently skips the seventh
 * added next year would leave exactly the defect it claims to have closed.
 */
import type { OpenAPIObject } from '@nestjs/swagger';

import { zodDtoRegistrations } from '../validation/zod-dto-registry';
import {
  convertZodSchemaToOpenApi,
  ZodOpenApiSchemaError,
  type OpenApiSchemaObject,
} from './zod-openapi-schema';

/**
 * Bodies that are deliberately empty.
 *
 * Empty today, and an entry must justify itself: a command with no parameters
 * takes no body at all, so an empty *documented* body almost always means a
 * schema that failed to publish rather than one with nothing to say.
 */
const INTENTIONALLY_EMPTY_REQUEST_BODIES: ReadonlySet<string> = new Set<string>();

const JSON_MEDIA_TYPE = 'application/json';

const COMPONENTS_PREFIX = '#/components/schemas/';

type SchemaBag = Record<string, OpenApiSchemaObject>;

/**
 * Rewrites every registered DTO component from its Zod schema, then proves no
 * request body was left undocumented.
 */
export function applyZodDtoSchemas(document: OpenAPIObject): void {
  const schemas = schemaBagOf(document);

  for (const [name, schema] of zodDtoRegistrations()) {
    // A DTO used only for path or query parameters never becomes a component;
    // Swagger documents those from the operation's parameter list instead.
    if (!Object.hasOwn(schemas, name)) {
      continue;
    }
    const converted = convertZodSchemaToOpenApi(schema, `The \`${name}\` schema`);
    schemas[name] = converted.schema;
    mergeNamedSubSchemas(schemas, converted.components, name);
  }

  assertEveryRequestBodyIsPublished(document, schemas);
}

/**
 * Adds a converted schema's named sub-schemas to the document.
 *
 * A collision is only safe when the two definitions are identical — two bodies
 * legitimately share one nested shape. Anything else would publish one
 * structure under a name that describes another, which is worse than the empty
 * schema this augmentation exists to remove.
 */
function mergeNamedSubSchemas(
  schemas: SchemaBag,
  components: Readonly<Record<string, OpenApiSchemaObject>>,
  owner: string,
): void {
  for (const [name, component] of Object.entries(components)) {
    const existing = schemas[name];
    if (existing !== undefined && !isDeepEqual(existing, component)) {
      throw new ZodOpenApiSchemaError(
        `\`${owner}\` publishes a sub-schema named \`${name}\` that disagrees with the ` +
          'component already in the document; two different shapes cannot share one name.',
      );
    }
    schemas[name] = component;
  }
}

/**
 * Refuses a document in which a JSON request body publishes nothing.
 *
 * The check follows references, so a body whose top level has one property
 * while its nested structures stay opaque fails just as loudly as one that is
 * empty outright.
 */
function assertEveryRequestBodyIsPublished(document: OpenAPIObject, schemas: SchemaBag): void {
  for (const { operationId, schema } of jsonRequestBodySchemas(document)) {
    for (const { name, resolved } of reachableSchemas(schema, schemas, operationId)) {
      if (name !== undefined && INTENTIONALLY_EMPTY_REQUEST_BODIES.has(name)) {
        continue;
      }
      if (!isEmptyObjectSchema(resolved)) {
        continue;
      }
      const subject = name === undefined ? 'its request body' : `the \`${name}\` schema`;
      throw new ZodOpenApiSchemaError(
        `\`${operationId}\` publishes ${subject} as an empty object. A schema-backed body must ` +
          'be registered with `registerZodDtos` so its fields reach the document and the ' +
          'generated client.',
      );
    }
  }
}

/** Every JSON request-body schema in the document, with the operation that owns it. */
function jsonRequestBodySchemas(
  document: OpenAPIObject,
): readonly { operationId: string; schema: unknown }[] {
  const found: { operationId: string; schema: unknown }[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      const schema = jsonBodySchemaOf(operation);
      if (schema === undefined) {
        continue;
      }
      const declared = (operation as { operationId?: unknown }).operationId;
      const operationId =
        typeof declared === 'string' ? declared : `${method.toUpperCase()} ${path}`;
      found.push({ operationId, schema });
    }
  }
  return found;
}

function jsonBodySchemaOf(operation: unknown): unknown {
  if (operation === null || typeof operation !== 'object') {
    return undefined;
  }
  const body = (operation as { requestBody?: unknown }).requestBody;
  if (body === null || typeof body !== 'object') {
    return undefined;
  }
  const content = (body as { content?: unknown }).content;
  if (content === null || typeof content !== 'object') {
    return undefined;
  }
  const media = (content as Record<string, unknown>)[JSON_MEDIA_TYPE];
  if (media === null || typeof media !== 'object') {
    return undefined;
  }
  return (media as { schema?: unknown }).schema;
}

/** A schema and, when it came from a component, the name it was published under. */
interface ReachableSchema {
  readonly name: string | undefined;
  readonly resolved: unknown;
}

/**
 * The schema itself and every component it reaches, each visited once.
 *
 * A reference that does not resolve is a defect in its own right and is
 * reported rather than skipped — an unresolvable body is no more usable to a
 * client than an empty one.
 */
function reachableSchemas(
  schema: unknown,
  schemas: SchemaBag,
  operationId: string,
): readonly ReachableSchema[] {
  const collected: ReachableSchema[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown, name: string | undefined): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, undefined);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }

    const reference = (value as { $ref?: unknown }).$ref;
    if (typeof reference === 'string') {
      visitReference(reference);
      return;
    }

    collected.push({ name, resolved: value });
    for (const entry of Object.values(value as Record<string, unknown>)) {
      visit(entry, undefined);
    }
  };

  const visitReference = (reference: string): void => {
    if (!reference.startsWith(COMPONENTS_PREFIX)) {
      throw new ZodOpenApiSchemaError(
        `\`${operationId}\` references \`${reference}\`, which is not a document component.`,
      );
    }
    const target = reference.slice(COMPONENTS_PREFIX.length);
    if (seen.has(target)) {
      return;
    }
    seen.add(target);
    const component = schemas[target];
    if (component === undefined) {
      throw new ZodOpenApiSchemaError(
        `\`${operationId}\` references the component \`${target}\`, which the document does not define.`,
      );
    }
    visit(component, target);
  };

  visit(schema, undefined);
  return collected;
}

/**
 * An object schema that describes no field.
 *
 * `properties: {}` and a missing `properties` are both this defect. A schema
 * with `$ref`, `allOf`, `anyOf`, `oneOf` or `additionalProperties` describes
 * something and is not empty, and neither is a non-object schema.
 */
function isEmptyObjectSchema(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const schema = value as Record<string, unknown>;
  if (schema.type !== 'object') {
    return false;
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'additionalProperties', '$ref'] as const) {
    if (schema[key] !== undefined) {
      return false;
    }
  }
  const properties = schema.properties;
  if (properties === undefined) {
    return true;
  }
  return (
    properties !== null && typeof properties === 'object' && Object.keys(properties).length === 0
  );
}

/** Structural equality over the JSON subset an OpenAPI schema is made of. */
function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return entries.map(([key, entry]) => [key, canonicalize(entry)]);
}

/** The document's component-schema bag, created when the document has none. */
function schemaBagOf(document: OpenAPIObject): SchemaBag {
  document.components ??= {};
  document.components.schemas ??= {};
  return document.components.schemas as SchemaBag;
}
