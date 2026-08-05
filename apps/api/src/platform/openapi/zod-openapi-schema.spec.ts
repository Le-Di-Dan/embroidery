/**
 * The conversion vocabulary (`APP3-P03` §9).
 *
 * One case per construct the repository's request schemas actually use. The
 * point of each is not that Zod's exporter works — it is that *this* API's
 * schemas land on a published shape a client can act on, and that anything it
 * cannot express stops the build instead of publishing a lie.
 */
import { z } from 'zod';

import { convertZodSchemaToOpenApi, ZodOpenApiSchemaError } from './zod-openapi-schema';

type Schema = Record<string, unknown>;

const convert = (schema: z.ZodType): Schema =>
  convertZodSchemaToOpenApi(schema, 'The test schema').schema;

/**
 * One published property.
 *
 * An absent property yields `{}` rather than `undefined`, so a lost field
 * fails on the assertion that names it instead of on a type error two lines up.
 */
const propertyOf = (schema: z.ZodType, name: string): Schema => nested(convert(schema), name);

/** One property of an already-converted schema. */
const nested = (schema: Schema | undefined, name: string): Schema =>
  ((schema?.properties ?? {}) as Record<string, Schema>)[name] ?? {};

/** One named sub-schema of a conversion result. */
const componentOf = (components: Readonly<Record<string, Schema>>, name: string): Schema =>
  components[name] ?? {};

describe('convertZodSchemaToOpenApi — object and requiredness', () => {
  it('publishes a required field in `required` and in `properties`', () => {
    const converted = convert(z.object({ name: z.string() }).strict());
    expect(converted.type).toBe('object');
    expect(converted.properties).toEqual({ name: { type: 'string' } });
    expect(converted.required).toEqual(['name']);
  });

  it('publishes an optional field as a property that is not required', () => {
    const converted = convert(z.object({ name: z.string(), note: z.string().optional() }).strict());
    expect(Object.keys(converted.properties as object).sort()).toEqual(['name', 'note']);
    expect(converted.required).toEqual(['name']);
  });

  it('publishes `.strict()` as a closed object', () => {
    expect(convert(z.object({ a: z.string() }).strict()).additionalProperties).toBe(false);
  });

  it('never publishes an object with properties as empty', () => {
    const converted = convert(z.object({ a: z.string() }).strict());
    expect(Object.keys(converted.properties as object)).not.toHaveLength(0);
  });

  it('publishes an object with no fields as exactly that, without inventing one', () => {
    const converted = convert(z.object({}).strict());
    expect(converted.properties).toEqual({});
    expect(converted.required).toBeUndefined();
  });
});

describe('convertZodSchemaToOpenApi — nullability', () => {
  it('publishes a nullable field with OpenAPI 3.0 `nullable`, not a null union', () => {
    const property = propertyOf(z.object({ d: z.string().nullable() }).strict(), 'd');
    expect(property).toEqual({ type: 'string', nullable: true });
  });

  it('separates nullable from optional: a nullable field stays required', () => {
    const converted = convert(z.object({ d: z.string().nullable() }).strict());
    expect(converted.required).toEqual(['d']);
  });

  it('publishes nullable-and-optional as nullable and not required', () => {
    const schema = z.object({ d: z.string().nullable().optional() }).strict();
    expect(propertyOf(schema, 'd').nullable).toBe(true);
    expect(convert(schema).required).toBeUndefined();
  });
});

describe('convertZodSchemaToOpenApi — enums, literals and unions', () => {
  it('publishes an enum with its exact members in declaration order', () => {
    const property = propertyOf(z.object({ s: z.enum(['DRAFT', 'PUBLISHED']) }).strict(), 's');
    expect(property).toEqual({ type: 'string', enum: ['DRAFT', 'PUBLISHED'] });
  });

  it('publishes a literal as a single-member enum', () => {
    expect(propertyOf(z.object({ k: z.literal('X') }).strict(), 'k')).toEqual({
      type: 'string',
      enum: ['X'],
    });
  });

  it('publishes a union as `anyOf` over both branches', () => {
    const property = propertyOf(z.object({ u: z.union([z.string(), z.number()]) }).strict(), 'u');
    expect(property).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
  });

  // A discriminated union publishes as `oneOf` — exactly one branch may match —
  // where a plain union publishes as `anyOf`. The distinction is the discriminant
  // itself, so it is asserted rather than smoothed over.
  it('publishes a discriminated union as `oneOf` over its branches', () => {
    const schema = z
      .object({
        event: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('a'), a: z.string() }).strict(),
          z.object({ kind: z.literal('b'), b: z.number() }).strict(),
        ]),
      })
      .strict();
    const branches = propertyOf(schema, 'event').oneOf as Record<string, unknown>[];
    expect(branches).toHaveLength(2);
    expect(propertyOf(schema, 'event').anyOf).toBeUndefined();
    expect(Object.keys(branches[0]?.properties ?? {}).sort()).toEqual(['a', 'kind']);
  });
});

describe('convertZodSchemaToOpenApi — strings, numbers and formats', () => {
  it('publishes string length bounds', () => {
    const property = propertyOf(z.object({ n: z.string().min(1).max(200) }).strict(), 'n');
    expect(property).toMatchObject({ type: 'string', minLength: 1, maxLength: 200 });
  });

  it('publishes a regular expression as a pattern', () => {
    const property = propertyOf(z.object({ a: z.string().regex(/^\d{1,12}$/) }).strict(), 'a');
    expect(property.pattern).toBe('^\\d{1,12}$');
  });

  it('publishes `datetime({ offset: true })` with the `date-time` format', () => {
    const property = propertyOf(
      z.object({ t: z.string().datetime({ offset: true }) }).strict(),
      't',
    );
    expect(property.format).toBe('date-time');
    expect(property.type).toBe('string');
  });

  it('publishes a uuid with the `uuid` format', () => {
    expect(propertyOf(z.object({ id: z.string().uuid() }).strict(), 'id').format).toBe('uuid');
  });

  it('publishes an integer as `integer`, not as a bare number', () => {
    const property = propertyOf(z.object({ n: z.number().int().min(0).max(10_000) }).strict(), 'n');
    expect(property).toMatchObject({ type: 'integer', minimum: 0, maximum: 10_000 });
  });

  it('publishes an exclusive bound as an exclusive bound', () => {
    const property = propertyOf(z.object({ w: z.number().positive() }).strict(), 'w');
    expect(property).toMatchObject({ minimum: 0, exclusiveMinimum: true });
  });

  it('publishes a coerced query number as the type the client sends it as', () => {
    const property = propertyOf(
      z.object({ limit: z.coerce.number().int().min(1).max(100) }).strict(),
      'limit',
    );
    expect(property).toMatchObject({ type: 'integer', minimum: 1, maximum: 100 });
  });
});

describe('convertZodSchemaToOpenApi — arrays and nesting', () => {
  it('publishes an array with its item schema and bound', () => {
    const property = propertyOf(
      z.object({ ids: z.array(z.string().uuid()).max(20) }).strict(),
      'ids',
    );
    expect(property.type).toBe('array');
    expect(property.maxItems).toBe(20);
    expect((property.items as Record<string, unknown>).format).toBe('uuid');
  });

  it('publishes a nested object inline, fields and all', () => {
    const schema = z
      .object({ child: z.object({ code: z.string(), n: z.number() }).strict() })
      .strict();
    const child = propertyOf(schema, 'child');
    expect(Object.keys(child.properties as object).sort()).toEqual(['code', 'n']);
    expect(child.required).toEqual(['code', 'n']);
  });

  it('publishes a named sub-schema as a component reference', () => {
    const child = z.object({ code: z.string() }).strict().meta({ id: 'ChildBody' });
    const converted = convertZodSchemaToOpenApi(
      z.object({ items: z.array(child) }).strict(),
      'The test schema',
    );
    expect(nested(converted.schema, 'items').items).toEqual({
      $ref: '#/components/schemas/ChildBody',
    });
    expect(Object.keys(converted.components)).toEqual(['ChildBody']);
    expect(componentOf(converted.components, 'ChildBody').properties).toEqual({
      code: { type: 'string' },
    });
  });

  it('names every level of a nested structure, not only the outermost', () => {
    const area = z.object({ code: z.string() }).strict().meta({ id: 'AreaBody' });
    const side = z
      .object({ areas: z.array(area) })
      .strict()
      .meta({ id: 'SideBody' });
    const converted = convertZodSchemaToOpenApi(
      z.object({ sides: z.array(side) }).strict(),
      'The test schema',
    );
    expect(Object.keys(converted.components).sort()).toEqual(['AreaBody', 'SideBody']);
    const areas = nested(componentOf(converted.components, 'SideBody'), 'areas');
    expect(areas.items).toEqual({ $ref: '#/components/schemas/AreaBody' });
  });
});

describe('convertZodSchemaToOpenApi — authored documentation', () => {
  it('publishes a description and an example from `.meta()`', () => {
    const property = propertyOf(
      z.object({ t: z.string().meta({ description: 'A token.', example: 'abc' }) }).strict(),
      't',
    );
    expect(property).toMatchObject({ description: 'A token.', example: 'abc' });
  });

  it('carries a description onto a named sub-schema', () => {
    const child = z.object({ a: z.string() }).strict().meta({ id: 'Doc', description: 'A child.' });
    const converted = convertZodSchemaToOpenApi(z.object({ c: child }).strict(), 'The test schema');
    expect(componentOf(converted.components, 'Doc').description).toBe('A child.');
  });
});

describe('convertZodSchemaToOpenApi — refusals', () => {
  it('refuses an unrepresentable node rather than publishing an empty schema', () => {
    expect(() => convert(z.object({ when: z.date() }).strict())).toThrow(ZodOpenApiSchemaError);
  });

  it('names the schema that failed, so a build says which body stopped it', () => {
    expect(() =>
      convertZodSchemaToOpenApi(z.object({ n: z.bigint() }).strict(), 'The `SomeBody` schema'),
    ).toThrow(/The `SomeBody` schema cannot be published/);
  });

  it('refuses a self-referential schema instead of recursing forever', () => {
    const node: z.ZodType = z.lazy(() => z.object({ child: node.optional() }).strict());
    expect(() => convertZodSchemaToOpenApi(node, 'The recursive schema')).toThrow(
      ZodOpenApiSchemaError,
    );
  });

  it('publishes the input form, so a transform never documents its own output', () => {
    const schema = z
      .object({ email: z.string().transform((value) => value.toLowerCase()) })
      .strict();
    expect(propertyOf(schema, 'email')).toEqual({ type: 'string' });
  });

  it('drops a refinement without dropping the field it constrains', () => {
    const schema = z
      .object({ a: z.string().refine((value) => value.length > 2, 'too short') })
      .strict();
    expect(propertyOf(schema, 'a')).toEqual({ type: 'string' });
    expect(convert(schema).required).toEqual(['a']);
  });

  it('leaves no `$schema`, `$defs` or `definitions` key in the published schema', () => {
    const child = z.object({ a: z.string() }).strict().meta({ id: 'Leftover' });
    const converted = convertZodSchemaToOpenApi(z.object({ c: child }).strict(), 'The test schema');
    for (const key of ['$schema', '$defs', 'definitions']) {
      expect(converted.schema).not.toHaveProperty(key);
    }
  });
});
