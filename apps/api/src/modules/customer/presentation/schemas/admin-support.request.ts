/**
 * Request-side validation for the four Admin support operations (`APP4-B07`).
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

/**
 * Upper bound on an as-entered contact.
 *
 * The same bound `issueVerificationChallengeSchema` uses, and for the same
 * reason: it is a denial-of-service limit, not a judgement about what a usable
 * address is. That judgement is `APP4-P01`'s normalizer, and a tighter rule here
 * would be a second, weaker copy of it.
 */
const MAX_CONTACT_LENGTH = 254;

/**
 * The exact-contact resolver body (Product Owner authority unblock, A01).
 *
 * Two fields, spelled exactly as `IssueVerificationChallengeBody` spells them,
 * because an operator's "email or phone" and a customer's are the same two
 * values and a second spelling would invite a second normalizer.
 *
 * **The body is the whole input, and that is the point.** A contact is the one
 * value in this phase that identifies a real person outside the system, so it
 * travels in a POST body — never a path segment, a query parameter or a header —
 * where it cannot reach a gateway access log, a browser history entry or a
 * `Referer`. The operation is a read; POST is the transport that keeps the value
 * out of the URL, not a claim that anything is written.
 *
 * The absences are the contract:
 *
 * - **no `q`, no prefix, no partial** — the value is matched whole, against the
 *   normalized form, or not at all. A prefix or fuzzy parameter is what turns an
 *   exact resolver into the contact-lookup oracle `ADR-APP4-001` §2.3 exists to
 *   prevent;
 * - **no `limit`, no cursor, no `includeUnverified`, no `includeDeactivated`** —
 *   there is no result *list* to page or widen. One Customer or none;
 * - **no `customerId`** — a caller who already has one uses the detail read;
 *   accepting it here would let a caller assert the answer;
 * - **no `maskedValue`** — a mask is one-way and shared by many contacts;
 *   accepting one would be a lookup by a value that does not identify a row.
 */
export const resolveCustomerByContactBodySchema = z
  .object({
    contactKind: z.enum(['EMAIL', 'PHONE']).meta({
      description: 'Which kind of destination `contact` is.',
      example: 'EMAIL',
    }),
    contact: z
      .string()
      .min(1)
      .max(MAX_CONTACT_LENGTH)
      .meta({
        description:
          'The contact exactly as the operator typed it. Normalized server-side by the ' +
          'canonical rules and matched whole; never echoed back, never logged and never ' +
          'stored by this operation.',
        example: 'nguoi.dung@example.com',
      }),
  })
  .strict()
  .meta({
    id: 'ResolveCustomerByContactBody',
    description: 'Resolves one exact, verified, active contact to the Customer that owns it.',
  });

export type ResolveCustomerByContactInput = z.infer<typeof resolveCustomerByContactBodySchema>;

export class ResolveCustomerByContactBody extends createZodDto(
  resolveCustomerByContactBodySchema,
) {}

registerZodDtos(
  AdminCustomerIdParam,
  AdminGrantIdParam,
  RevokeSecureGrantBody,
  ResolveCustomerByContactBody,
);
