/**
 * Request-side validation for the two merge lifecycle mutations
 * (`APP10-B02` §6.1, §9.1).
 *
 * Every schema is `.strict()`, following `admin-customer-maintenance.request.ts`:
 * an unknown field is a client bug worth reporting, and silently dropping one is
 * how a caller comes to believe it set something it did not. Here it is doing
 * real work — `.strict()` is what turns a body carrying `status`, `decidedAt`,
 * `requestedByAdminId` or a contact value into a 400 rather than an ignored key
 * a looser future handler might start honouring.
 *
 * ### No contact value is accepted anywhere
 *
 * Both participants are opaque ids. An operator finds them with the delivered
 * exact-contact resolver (`adminCustomerSupport_resolve`), which is the one
 * lookup this system has and is deliberately not a search. Accepting an email
 * or a phone number here would build a second contact-to-customer path with its
 * own normalization and its own enumeration surface, and would put a real
 * person's address in a request body that the merge audit trail sits next to.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** The merge-case path. One id, and it is a UUID before any query sees it. */
export const customerMergeCaseParamsSchema = z.object({ caseId: z.string().uuid() }).strict();

export class AdminCustomerMergeCaseParams extends createZodDto(customerMergeCaseParamsSchema) {}

/**
 * `customer_merge_cases.reason` is `text` with no database cap.
 *
 * The bound is a denial-of-service limit on a column an operator types into,
 * not a judgement about what a reason is — the same reasoning
 * `CUSTOMER_NOTES_MAX_LENGTH` and `REVOKE_REASON_MAX_LENGTH` record. It is
 * generous enough for a paragraph explaining why two identities are one person.
 */
export const MERGE_REASON_MAX_LENGTH = 1_000;

/**
 * A required, non-blank, trimmed reason.
 *
 * `.trim()` runs before the length checks, so a body of spaces is refused as
 * empty rather than stored as whitespace. It is required on both operations
 * because a merge is an exceptional, admin-only act (`DB3` §4): a case with no
 * stated justification is evidence that explains nothing, and the operator is
 * the only one who can supply it.
 */
const reasonSchema = (description: string, example: string): z.ZodType<string> =>
  z.string().trim().min(1).max(MERGE_REASON_MAX_LENGTH).meta({ description, example });

/**
 * The open body.
 *
 * Three fields. `survivorCustomerId` and `loserCustomerId` are stated
 * explicitly and are never swapped, defaulted or inferred by the server: which
 * identity survives shapes every later resolution of that customer, and the
 * operator decides it (`APP10-B02` §6.2).
 *
 * The `.refine()` refuses a self-merge here, one step before the database. It
 * is a contradiction decidable from the body alone — the request states that a
 * customer should absorb itself — so it is a 400 rather than a 409, matching the
 * way `updateCustomerProfileBodySchema` refuses an empty patch. CST-069's
 * `ck_customer_merge_cases__no_self_merge` remains the physical backstop and is
 * not re-implemented in the domain: an arbiter that cannot be raced is not
 * improved by a read that can.
 *
 * The absences are the contract:
 *
 * - **no `status`** — a case is born `REQUESTED` and there is no other state it
 *   may be created in;
 * - **no `decidedAt`** — the decision instant is the server's;
 * - **no `requestedByAdminId`** — attribution comes from the Admin session, and
 *   a caller-supplied one would let an operator file a merge against a colleague;
 * - **no contact value of any kind** — see the file header;
 * - **no consequence counts** — the preview is derived on read and stored
 *   nowhere (`APP10-B02` §8.3).
 */
export const openCustomerMergeBodySchema = z
  .object({
    survivorCustomerId: z
      .string()
      .uuid()
      .meta({
        description:
          'The Customer that survives the merge. Stated by the operator and never chosen, ' +
          'defaulted or swapped by the server. Obtained from the exact-contact resolver.',
        example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
      }),
    loserCustomerId: z
      .string()
      .uuid()
      .meta({
        description:
          'The Customer that would be merged away. Must not already be merged into another: ' +
          'merge chains are never followed or flattened.',
        example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073',
      }),
    reason: reasonSchema(
      'Why the operator believes these two records are the same person. Required: a merge is ' +
        'an exceptional, admin-only decision and the case is the evidence for it. Stored on the ' +
        'merge case and never copied into the audit trail, logged, or notified.',
      'Same person: the phone number was re-registered under a new email after a typo.',
    ),
  })
  .strict()
  .refine((body) => body.survivorCustomerId !== body.loserCustomerId, {
    message: 'The surviving and merged-away Customers must be different.',
  })
  .meta({
    id: 'OpenCustomerMergeBody',
    description:
      'Opens a REQUESTED merge case for one explicitly chosen pair. Nothing is transferred, ' +
      'revoked or tombstoned — that is the merge execution operation.',
  });

export class OpenCustomerMergeBody extends createZodDto(openCustomerMergeBodySchema) {}

/**
 * The reject body.
 *
 * One field, and it is mandatory for the reason the open reason is: declining a
 * merge is a decision somebody will later have to understand. It is recorded in
 * `audit_events.reason` — the repository's canonical home for an operator's
 * stated reason on an action — because `customer_merge_cases` has a single
 * `reason` column and it already holds why the case was raised.
 *
 * No `status` and no `decidedAt`: there is exactly one transition this operation
 * performs, and its instant is the server's.
 */
export const rejectCustomerMergeBodySchema = z
  .object({
    reason: reasonSchema(
      'Why the operator is declining this merge. Required, and recorded in the audit trail ' +
        'against the merge case.',
      'Different people: the shared phone number belongs to a shop, not to one customer.',
    ),
  })
  .strict()
  .meta({
    id: 'RejectCustomerMergeBody',
    description:
      'Declines a REQUESTED merge case. A lifecycle decision only: no contact, grant, request, ' +
      'order or asset is touched, and neither Customer changes.',
  });

export class RejectCustomerMergeBody extends createZodDto(rejectCustomerMergeBodySchema) {}

registerZodDtos(AdminCustomerMergeCaseParams, OpenCustomerMergeBody, RejectCustomerMergeBody);
