/**
 * Platform OpenAPI publication (`APP3-P03`).
 *
 * The conversion authority that turns the Zod schema validating a request into
 * the schema documenting it, and the document augmentation that applies it.
 */
export { applyZodDtoSchemas } from './zod-dto-schema.augmentation';
export { convertZodSchemaToOpenApi, ZodOpenApiSchemaError } from './zod-openapi-schema';
export type { ConvertedZodSchema, OpenApiSchemaObject } from './zod-openapi-schema';
