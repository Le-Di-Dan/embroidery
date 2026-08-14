/**
 * Request-side validation for the three Admin support operations (`APP4-B07`).
 *
 * Every schema is `.strict()`: an unknown field is a client bug worth reporting,
 * and silently dropping one is how a caller believes it set something it did
 * not.
 *
 * The two path parameters are UUIDs, rejected before any repository call, so a
 * malformed id can never reach a query.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** UUID path parameter — rejected before any repository call. */
export const customerIdParamSchema = z.object({ customerId: z.string().uuid() }).strict();

export class AdminCustomerIdParam extends createZodDto(customerIdParamSchema) {}

export const grantIdParamSchema = z.object({ grantId: z.string().uuid() }).strict();

export class AdminGrantIdParam extends createZodDto(grantIdParamSchema) {}

/**
 * `secure_access_grants.revoke_reason` is `text`; the cap keeps the column and
 * the audit row it is copied to bounded.
 */
export const REVOKE_REASON_MAX_LENGTH = 500;

/**
 * The revoke body: one field, and the absences are the contract.
 *
 * - no `customerId` / `customRequestId` — the grant's target is persisted, and
 *   accepting one would let a caller assert whose grant they are killing;
 * - no `token` — a revocation is addressed by id and never by credential; a
 *   token in this body would be a live secret in an Admin request log;
 * - no `scopeKind` — `REQUEST_ACCESS` is authority (ADR-DB3-004 r1) and is not a
 *   caller's to choose, on any operation;
 * - no `actorId` — the acting Admin comes from the authenticated session, never
 *   from the body, or an operator could file their action against a colleague;
 * - no `replacementGrantId` / `reissue` flag — revocation mints nothing. LC-03
 *   has no `REVOKED → ACTIVE` edge, and restoring access is a fresh issue
 *   through APP5, not a parameter here.
 *
 * The reason is trimmed and non-empty because a blank one is not evidence:
 * `ck_secure_access_grants__revoke_reason_required` insists on it at the schema
 * level and `SecureGrantIssuer.revoke` insists again in the application. This is
 * the third and outermost check, and it is the one that produces a readable 400
 * rather than an opaque constraint violation — it does not replace either.
 */
export const revokeSecureGrantBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1)
      .max(REVOKE_REASON_MAX_LENGTH)
      .meta({
        description:
          'Why this grant is being revoked, in the operator’s own words. Mandatory and ' +
          'non-blank: it is copied into the audit trail, which outlives the grant, and a ' +
          'revoked grant without a reason is not evidence.',
      }),
  })
  .strict()
  .meta({
    id: 'RevokeSecureGrantBody',
    description: 'Withdraws a live secure grant, with a mandatory reason.',
  });

export type RevokeSecureGrantInput = z.infer<typeof revokeSecureGrantBodySchema>;

export class RevokeSecureGrantBody extends createZodDto(revokeSecureGrantBodySchema) {}

registerZodDtos(AdminCustomerIdParam, AdminGrantIdParam, RevokeSecureGrantBody);
