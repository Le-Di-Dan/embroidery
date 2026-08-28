/**
 * Request-side validation for the three Admin maintenance mutations
 * (`APP10-B01`).
 *
 * Every schema is `.strict()`, following `admin-support.request.ts`: an unknown
 * field is a client bug worth reporting, and silently dropping one is how a
 * caller comes to believe it set something it did not. Here that rule is doing
 * real security work rather than tidiness — `.strict()` is what turns a body
 * carrying `verifiedAt`, `mergedIntoCustomerId` or `anonymizedAt` into a 400
 * instead of an ignored key that a later, looser handler might start honouring.
 *
 * Both path parameters are UUIDs, rejected before any repository call, so a
 * malformed id can never reach a query.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The contact-scoped path.
 *
 * Both ids together, because both are load-bearing: the contact is resolved
 * *within* the customer named here, so a contact id alone addresses nothing.
 * That is the ownership rule expressed in the URL rather than only in code.
 */
export const customerContactParamsSchema = z
  .object({ customerId: z.string().uuid(), contactId: z.string().uuid() })
  .strict();

export class AdminCustomerContactParams extends createZodDto(customerContactParamsSchema) {}

/**
 * `customers.display_name` is `text` with no database cap.
 *
 * The bound is a denial-of-service limit on a column an operator types into,
 * not a judgement about what a name is — the same reasoning
 * `REVOKE_REASON_MAX_LENGTH` records. It is generous enough for a full
 * Vietnamese name with titles and a company suffix.
 */
export const CUSTOMER_DISPLAY_NAME_MAX_LENGTH = 200;

/** Same rule for `customers.notes`, sized for a support note rather than a name. */
export const CUSTOMER_NOTES_MAX_LENGTH = 2_000;

/**
 * The profile patch body.
 *
 * Two optional, nullable fields and a contract stated once, matching the one
 * `APP2-B02-C1` §9 fixed for a product description:
 *
 * ```text
 *   absent         -> leave the stored value unchanged
 *   null or blank  -> clear it to NULL
 *   any other text -> store it
 * ```
 *
 * A blank string clears rather than storing, because a record holding a name
 * that renders as nothing is a state with no meaning and two ways to reach it.
 *
 * The absences are the contract:
 *
 * - **no `verifiedAt`** — NOT NULL and immutable (ADR-DB2-001 option A). It is
 *   the verification fact itself, and nothing may rewrite it;
 * - **no `mergedIntoCustomerId`** — the merge tombstone, written once by the
 *   merge execution checkpoint inside its own transaction and never by a patch;
 * - **no `anonymizedAt`** — retention's marker, not an operator's;
 * - **no contact field of any kind** — no value, no kind, no `verified`, no
 *   `primary`. Contacts are addressed by their own two operations, and a
 *   contact value in a JSON patch is how a verified channel gets overwritten in
 *   place;
 * - **no `businessProfile`** — a different table with no Admin surface;
 * - **no `customerId`** — the target is the path, and accepting it in the body
 *   would let the two disagree.
 *
 * At least one field must be present. An empty patch is a request that states
 * no intention, and answering it 200 would make "nothing happened because you
 * asked for nothing" indistinguishable from "nothing happened because the
 * values already matched".
 */
export const updateCustomerProfileBodySchema = z
  .object({
    displayName: z
      .string()
      .max(CUSTOMER_DISPLAY_NAME_MAX_LENGTH)
      .nullable()
      .optional()
      .meta({
        description:
          'What this Customer calls themselves, on the Customer record alone. Never a Business ' +
          'Profile company name and never derived from a contact. Send `null` or a blank string ' +
          'to clear it; omit the field to leave it unchanged.',
        example: 'Nguyễn Minh An',
      }),
    notes: z
      .string()
      .max(CUSTOMER_NOTES_MAX_LENGTH)
      .nullable()
      .optional()
      .meta({
        description:
          'The operator’s internal note on this Customer. Staff-facing only: it is never shown ' +
          'to the Customer, never notified and never part of a public or secure-link response. ' +
          'Send `null` or a blank string to clear it; omit the field to leave it unchanged.',
        example: 'Prefers to be contacted in the afternoon.',
      }),
  })
  .strict()
  .refine((body) => body.displayName !== undefined || body.notes !== undefined, {
    message: 'A patch must name at least one field.',
  })
  .meta({
    id: 'UpdateCustomerProfileBody',
    description:
      'Bounded maintenance of a Customer’s profile metadata. Two fields, and neither ' +
      'verification evidence, merge state nor any contact is reachable through it.',
  });

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileBodySchema>;

export class UpdateCustomerProfileBody extends createZodDto(updateCustomerProfileBodySchema) {}

registerZodDtos(AdminCustomerContactParams, UpdateCustomerProfileBody);
