/**
 * Zod → OpenAPI 3.0 schema conversion (`APP3-P03`).
 *
 * The single conversion authority for every schema-backed request in this API.
 * It is Zod's own exporter — `z.toJSONSchema`, official and stable since Zod 4 —
 * not a hand-written walker: the schema that validates a request and the schema
 * that documents it are then two renderings of one object, and no third party
 * can drift from either.
 *
 * Three options carry the design:
 *
 * - `io: 'input'` — a request body is documented as what a client **sends**. A
 *   schema that transforms (`StaffLoginSchema` lowercases its email) would
 *   otherwise publish its parsed output as if the caller had to send that.
 * - `unrepresentable: 'throw'` — a construct JSON Schema cannot express stops
 *   generation. The defect this checkpoint closes was precisely a silent `{}`;
 *   replacing it with a *quieter* silent omission would be no better.
 * - `cycles: 'throw'` — a self-referential body has no finite published form.
 *
 * A refinement (`.refine`) is not an unrepresentable *node* and is dropped
 * rather than thrown on — it is a predicate over an already-typed value, so the
 * published type stays correct while the predicate stays unpublished. Where that
 * loses a real constraint, the schema carries it in `.meta({ description })`.
 */
import { z, type ZodType } from 'zod';

/** An OpenAPI 3.0 schema object. Structural: the type is not exported by `@nestjs/swagger`. */
export type OpenApiSchemaObject = Record<string, unknown>;

/** A converted schema plus every named sub-schema it references. */
export interface ConvertedZodSchema {
  readonly schema: OpenApiSchemaObject;
  readonly components: Readonly<Record<string, OpenApiSchemaObject>>;
}

/** A schema that cannot be published. Thrown at generation time, never at runtime. */
export class ZodOpenApiSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZodOpenApiSchemaError';
  }
}

const CONVERSION_OPTIONS = {
  target: 'openapi-3.0',
  io: 'input',
  unrepresentable: 'throw',
  cycles: 'throw',
} as const;

/**
 * Where Zod puts a named sub-schema.
 *
 * `openapi-3.0` emits `definitions`; the JSON-Schema targets emit `$defs`. Both
 * are accepted so a future target change cannot silently drop the sub-schemas
 * and leave dangling references behind.
 */
const LOCAL_REF_PREFIX = /^#\/(?:definitions|\$defs)\//;

const COMPONENTS_PREFIX = '#/components/schemas/';

/**
 * Converts one Zod schema into an OpenAPI schema and its named sub-schemas.
 *
 * `context` names the schema in any failure — a generation error must say which
 * request body stopped the build, not merely that one did.
 */
export function convertZodSchemaToOpenApi(schema: ZodType, context: string): ConvertedZodSchema {
  const raw = exportJsonSchema(schema, context);

  const named: Record<string, unknown> = {
    ...readDefinitions(raw.$defs, context),
    ...readDefinitions(raw.definitions, context),
  };

  const root = { ...raw };
  delete root.$schema;
  delete root.$defs;
  delete root.definitions;

  const components: Record<string, OpenApiSchemaObject> = {};
  for (const [name, definition] of Object.entries(named)) {
    components[name] = asSchemaObject(rewriteRefs(definition, `${context} → \`${name}\``), context);
  }

  return { schema: asSchemaObject(rewriteRefs(root, context), context), components };
}

/** Runs Zod's exporter, turning any refusal into a named generation failure. */
function exportJsonSchema(schema: ZodType, context: string): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, CONVERSION_OPTIONS);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ZodOpenApiSchemaError(
      `${context} cannot be published as OpenAPI: ${detail}. ` +
        'Express the construct in a representable way, or give the schema an explicit ' +
        'published form — do not leave the request body undocumented.',
    );
  }
}

/** Reads a `definitions`/`$defs` bag, refusing anything that is not one. */
function readDefinitions(value: unknown, context: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ZodOpenApiSchemaError(
      `${context} produced named sub-schemas of an unexpected shape.`,
    );
  }
  return value as Record<string, unknown>;
}

/** Moves every local reference onto the OpenAPI components path. */
function rewriteRefs(value: unknown, context: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteRefs(item, context));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const rewritten: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    rewritten[key] = key === '$ref' ? rewriteRef(entry, context) : rewriteRefs(entry, context);
  }
  return rewritten;
}

/**
 * A reference must be local and resolvable.
 *
 * An external or unrecognised `$ref` would publish a document whose reader
 * cannot resolve the body at all — indistinguishable, to a client, from the
 * empty schema this checkpoint exists to remove.
 */
function rewriteRef(value: unknown, context: string): string {
  if (typeof value === 'string' && value.startsWith(COMPONENTS_PREFIX)) {
    return value;
  }
  if (typeof value !== 'string' || !LOCAL_REF_PREFIX.test(value)) {
    throw new ZodOpenApiSchemaError(
      `${context} contains a reference this API cannot publish: ${JSON.stringify(value)}.`,
    );
  }
  return value.replace(LOCAL_REF_PREFIX, COMPONENTS_PREFIX);
}

function asSchemaObject(value: unknown, context: string): OpenApiSchemaObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ZodOpenApiSchemaError(`${context} did not convert to an OpenAPI schema object.`);
  }
  return value as OpenApiSchemaObject;
}
