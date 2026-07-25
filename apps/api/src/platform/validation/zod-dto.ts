/**
 * Schema-backed DTO metatype mechanism (APP1-B01-C1).
 *
 * `createZodDto(schema)` returns a class carrying the Zod schema as static
 * metadata. A controller declares `@Body() body: SomeDto` where
 * `class SomeDto extends createZodDto(schema) {}`; the global `ZodValidationPipe`
 * reads the static schema off the metatype and parses. The parsed output type is
 * inferred from the schema, so the handler receives a fully typed value — no
 * `unknown`, no unchecked cast, and no reflection on minified class names.
 */
import type { ZodType, output } from 'zod';

/** A metatype that carries a Zod schema the pipe can validate against. */
export interface ZodSchemaCarrier {
  readonly zodSchema: ZodType;
}

/**
 * Builds a DTO base class whose instances have the schema's output type and
 * whose constructor carries the schema statically.
 */
export function createZodDto<S extends ZodType>(schema: S): { new (): output<S>; zodSchema: S } {
  class ZodDto {
    static readonly zodSchema = schema;
  }
  return ZodDto as unknown as { new (): output<S>; zodSchema: S };
}

/** Extracts the schema from a metatype, or `undefined` for a non-Zod metatype. */
export function zodSchemaOf(metatype: unknown): ZodType | undefined {
  if (typeof metatype !== 'function') {
    return undefined;
  }
  const schema = (metatype as Partial<ZodSchemaCarrier>).zodSchema;
  // Structural check — a Zod schema exposes `safeParse`; avoids importing the
  // concrete class and works across a minified build.
  return schema !== undefined && typeof (schema as { safeParse?: unknown }).safeParse === 'function'
    ? schema
    : undefined;
}
