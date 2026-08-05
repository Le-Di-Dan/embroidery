/**
 * Canonical API validation foundation (APP1-B01-C1).
 *
 * The reusable Zod validation pipeline: the global pipe, the schema-backed DTO
 * mechanism, and the issue → field-error mapper. Feature modules own their
 * schemas; this platform layer owns the pipe and the error contract.
 */
export { createZodDto, zodSchemaOf } from './zod-dto';
export type { ZodSchemaCarrier } from './zod-dto';
export { registerZodDtos, resetZodDtoRegistrations, zodDtoRegistrations } from './zod-dto-registry';
export type { ZodDtoClass } from './zod-dto-registry';
export { ZodValidationPipe } from './zod-validation.pipe';
export { ValidationModule } from './validation.module';
export { mapZodError, FIELD_ERROR_CODES } from './zod-issue.mapper';
export type { FieldErrorCode } from './zod-issue.mapper';
