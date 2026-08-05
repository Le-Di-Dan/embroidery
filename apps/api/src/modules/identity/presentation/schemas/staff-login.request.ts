/**
 * Staff login request contract and schema (ADR-APP1-001 §12, FU-A03).
 *
 * Validation is owned by the canonical Zod pipeline (APP1-B01-C1): the feature
 * declares the schema, the platform `ZodValidationPipe` runs it and maps issues
 * to the canonical `errors[]`. The `StaffLoginRequest` class exists only to give
 * Swagger a named request schema (`@ApiBody`); a contract test keeps its fields
 * aligned with the Zod schema. The password is never normalized here — the
 * password service owns its canonical NFKC handling — and never echoed.
 */
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

import { createZodDto } from '../../../../platform/validation/zod-dto';
import { registerZodDtos } from '../../../../platform/validation/zod-dto-registry';

/** RFC 5321 practical maximum for an email address. */
export const MAX_EMAIL_BYTES = 254;
/** Reject longer passwords outright — no silent truncation (ADR §2). */
export const MAX_PASSWORD_BYTES = 4096;

/** Bounded, backtracking-safe address shape: `local@domain.tld`. */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * The canonical staff-login schema. Email is trimmed, NFKC-normalized and
 * lowercased to its lookup form; the password is length-guarded only. Unknown
 * fields are rejected (`.strict()`) so a crafted body cannot smuggle extra keys.
 */
export const StaffLoginSchema = z
  .object({
    email: z
      .string()
      .transform((value) => value.trim().normalize('NFKC').toLowerCase())
      .refine((value) => value.length > 0, { params: { fieldCode: 'REQUIRED' } })
      .refine((value) => byteLength(value) <= MAX_EMAIL_BYTES, {
        params: { fieldCode: 'TOO_LONG' },
      })
      .refine((value) => EMAIL_PATTERN.test(value), { params: { fieldCode: 'INVALID' } }),
    password: z
      .string()
      .refine((value) => value.length > 0, { params: { fieldCode: 'REQUIRED' } })
      .refine((value) => byteLength(value) <= MAX_PASSWORD_BYTES, {
        params: { fieldCode: 'TOO_LONG' },
      }),
  })
  .strict();

export type ParsedStaffLogin = z.output<typeof StaffLoginSchema>;

/** The validated DTO the global pipe produces for the controller. */
export class StaffLoginRequestDto extends createZodDto(StaffLoginSchema) {}

registerZodDtos(StaffLoginRequestDto);

/**
 * The published shape for `@ApiBody`; not used for validation.
 *
 * The one body in this API that `APP3-P03` deliberately did **not** move onto
 * the platform converter. Both of its fields are constrained entirely by
 * `.refine()` — a predicate over an already-typed string — and a refinement has
 * no JSON Schema rendering by construction, so converting this schema would
 * publish two bare strings and *lose* the address format and the length bound a
 * client can see today. The contract spec binds the two together: the fields and
 * the required list here must match `StaffLoginSchema` exactly, so this class
 * can document more than the converter can, never something different.
 */
export class StaffLoginRequest {
  @ApiProperty({ format: 'email', maxLength: MAX_EMAIL_BYTES, example: 'admin@example.test' })
  email!: string;

  @ApiProperty({ writeOnly: true, description: 'Plain password; never stored or echoed.' })
  password!: string;
}
