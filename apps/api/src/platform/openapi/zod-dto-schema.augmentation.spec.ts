/**
 * The document augmentation (`APP3-P03` §9).
 *
 * Two responsibilities, tested separately: it replaces the empty component
 * Swagger emits for a schema-backed DTO, and it refuses to hand back a document
 * in which a request body still publishes nothing. The second is what makes the
 * fix hold for bodies that do not exist yet.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';

import { createZodDto } from '../validation/zod-dto';
import { registerZodDtos, resetZodDtoRegistrations } from '../validation/zod-dto-registry';
import { applyZodDtoSchemas } from './zod-dto-schema.augmentation';
import { ZodOpenApiSchemaError } from './zod-openapi-schema';

/** What `@nestjs/swagger` emits for a class with no decorated property. */
const EMPTY_COMPONENT = { type: 'object', properties: {} };

interface DocumentParts {
  readonly bodyComponent?: string;
  readonly schemas?: Record<string, unknown>;
  readonly bodySchema?: unknown;
}

function documentWith({ bodyComponent, schemas, bodySchema }: DocumentParts): OpenAPIObject {
  const schema =
    bodySchema ??
    (bodyComponent === undefined ? undefined : { $ref: `#/components/schemas/${bodyComponent}` });
  return {
    openapi: '3.0.0',
    info: { title: 'test', version: '1' },
    paths: {
      '/api/things': {
        post: {
          operationId: 'thing_create',
          responses: {},
          ...(schema === undefined
            ? {}
            : { requestBody: { content: { 'application/json': { schema } } } }),
        },
      },
    },
    components: { schemas: { ...schemas } },
  } as unknown as OpenAPIObject;
}

type Schema = Record<string, unknown>;

const schemasOf = (document: OpenAPIObject): Record<string, Schema> =>
  (document.components?.schemas ?? {}) as Record<string, Schema>;

/** One component, or `{}` — so a missing one fails on the assertion that names it. */
const schemaAt = (document: OpenAPIObject, name: string): Schema => schemasOf(document)[name] ?? {};

/** One property of a component. */
const propertyAt = (schema: Schema, name: string): Schema =>
  ((schema.properties ?? {}) as Record<string, Schema>)[name] ?? {};

beforeEach(() => {
  resetZodDtoRegistrations();
});

afterAll(() => {
  resetZodDtoRegistrations();
});

describe('applyZodDtoSchemas — replacing the empty component', () => {
  it('rewrites the empty component with the schema that validates the request', () => {
    class ThingBody extends createZodDto(
      z.object({ name: z.string(), note: z.string().optional() }).strict(),
    ) {}
    registerZodDtos(ThingBody);

    const document = documentWith({
      bodyComponent: 'ThingBody',
      schemas: { ThingBody: { ...EMPTY_COMPONENT } },
    });
    applyZodDtoSchemas(document);

    expect(Object.keys(schemaAt(document, 'ThingBody').properties as object).sort()).toEqual([
      'name',
      'note',
    ]);
    expect(schemaAt(document, 'ThingBody').required).toEqual(['name']);
  });

  it('publishes under the class name, so an existing component keeps its identity', () => {
    class ThingBody extends createZodDto(z.object({ name: z.string() }).strict()) {}
    registerZodDtos(ThingBody);

    const document = documentWith({
      bodyComponent: 'ThingBody',
      schemas: { ThingBody: { ...EMPTY_COMPONENT } },
    });
    applyZodDtoSchemas(document);

    expect(Object.keys(schemasOf(document))).toEqual(['ThingBody']);
  });

  it('adds a named sub-schema as its own component and references it', () => {
    const child = z.object({ code: z.string() }).strict().meta({ id: 'ChildBody' });
    class ThingBody extends createZodDto(z.object({ items: z.array(child) }).strict()) {}
    registerZodDtos(ThingBody);

    const document = documentWith({
      bodyComponent: 'ThingBody',
      schemas: { ThingBody: { ...EMPTY_COMPONENT } },
    });
    applyZodDtoSchemas(document);

    const items = propertyAt(schemaAt(document, 'ThingBody'), 'items');
    expect(items.items).toEqual({ $ref: '#/components/schemas/ChildBody' });
    expect(schemaAt(document, 'ChildBody').properties).toEqual({ code: { type: 'string' } });
  });

  it('leaves a DTO that is not a document component alone — params never become one', () => {
    class ThingParams extends createZodDto(z.object({ id: z.string() }).strict()) {}
    class ThingBody extends createZodDto(z.object({ name: z.string() }).strict()) {}
    registerZodDtos(ThingParams, ThingBody);

    const document = documentWith({
      bodyComponent: 'ThingBody',
      schemas: { ThingBody: { ...EMPTY_COMPONENT } },
    });
    applyZodDtoSchemas(document);

    expect(schemasOf(document)['ThingParams']).toBeUndefined();
  });

  it('leaves an unregistered, already-documented component untouched', () => {
    const handWritten = { type: 'object', properties: { email: { type: 'string' } } };
    const document = documentWith({
      bodyComponent: 'LegacyBody',
      schemas: { LegacyBody: handWritten },
    });
    applyZodDtoSchemas(document);
    expect(schemaAt(document, 'LegacyBody')).toEqual(handWritten);
  });

  it('refuses two different shapes claiming one sub-schema name', () => {
    const child = z.object({ code: z.string() }).strict().meta({ id: 'ChildBody' });
    class ThingBody extends createZodDto(z.object({ items: z.array(child) }).strict()) {}
    registerZodDtos(ThingBody);

    const document = documentWith({
      bodyComponent: 'ThingBody',
      schemas: {
        ThingBody: { ...EMPTY_COMPONENT },
        ChildBody: { type: 'object', properties: { somethingElse: { type: 'number' } } },
      },
    });
    expect(() => applyZodDtoSchemas(document)).toThrow(/cannot share one name/);
  });
});

describe('applyZodDtoSchemas — refusing an undocumented body', () => {
  it('refuses a request body left as an empty object', () => {
    const document = documentWith({
      bodyComponent: 'ForgottenBody',
      schemas: { ForgottenBody: { ...EMPTY_COMPONENT } },
    });
    expect(() => applyZodDtoSchemas(document)).toThrow(ZodOpenApiSchemaError);
    expect(() => applyZodDtoSchemas(document)).toThrow(/registerZodDtos/);
  });

  it('names the operation and the schema that failed', () => {
    const document = documentWith({
      bodyComponent: 'ForgottenBody',
      schemas: { ForgottenBody: { ...EMPTY_COMPONENT } },
    });
    expect(() => applyZodDtoSchemas(document)).toThrow(/`thing_create`.*`ForgottenBody`/);
  });

  it('refuses an inline request body left as an empty object', () => {
    const document = documentWith({ bodySchema: { ...EMPTY_COMPONENT } });
    expect(() => applyZodDtoSchemas(document)).toThrow(/its request body/);
  });

  it('refuses a body whose nested structure is opaque even though its top level is not', () => {
    const document = documentWith({
      bodyComponent: 'OuterBody',
      schemas: {
        OuterBody: {
          type: 'object',
          properties: { child: { $ref: '#/components/schemas/InnerBody' } },
        },
        InnerBody: { ...EMPTY_COMPONENT },
      },
    });
    expect(() => applyZodDtoSchemas(document)).toThrow(/`InnerBody`/);
  });

  it('refuses a body referencing a component the document does not define', () => {
    const document = documentWith({ bodyComponent: 'MissingBody' });
    expect(() => applyZodDtoSchemas(document)).toThrow(/does not define/);
  });

  it('accepts an object that constrains without listing properties', () => {
    const document = documentWith({
      bodySchema: { type: 'object', additionalProperties: { type: 'string' } },
    });
    expect(() => applyZodDtoSchemas(document)).not.toThrow();
  });

  it('accepts a composed body', () => {
    const document = documentWith({
      bodySchema: { type: 'object', allOf: [{ $ref: '#/components/schemas/PartBody' }] },
      schemas: { PartBody: { type: 'object', properties: { a: { type: 'string' } } } },
    });
    expect(() => applyZodDtoSchemas(document)).not.toThrow();
  });

  it('ignores a non-JSON body: a binary upload has no field list to publish', () => {
    const document = documentWith({});
    const operation = document.paths['/api/things']?.post as unknown as Record<string, unknown>;
    operation.requestBody = {
      content: { 'multipart/form-data': { schema: { ...EMPTY_COMPONENT } } },
    };
    expect(() => applyZodDtoSchemas(document)).not.toThrow();
  });

  it('ignores an operation with no request body at all', () => {
    expect(() => applyZodDtoSchemas(documentWith({}))).not.toThrow();
  });

  it('creates the component bag when the document has none', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
    } as unknown as OpenAPIObject;
    applyZodDtoSchemas(document);
    expect(document.components?.schemas).toEqual({});
  });

  it('visits a cyclic component graph once instead of looping', () => {
    const document = documentWith({
      bodyComponent: 'NodeBody',
      schemas: {
        NodeBody: {
          type: 'object',
          properties: { next: { $ref: '#/components/schemas/NodeBody' } },
        },
      },
    });
    expect(() => applyZodDtoSchemas(document)).not.toThrow();
  });
});
