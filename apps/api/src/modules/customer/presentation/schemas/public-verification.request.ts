/**
 * Request contracts for the two public verification operations (`APP4-B03`).
 *
 * The body names a destination and why it is being verified, and nothing else.
 * Everything the server owns is absent **by construction** and rejected by
 * `.strict()`: no challenge id, no code, no hash, no expiry, no TTL or cooldown
 * override, no template key, no notification field, no customer or contact-point
 * id, no grant or request reference.
 *
 * Two absences are deliberate rather than incidental:
 *
 * - **No `customerId`.** Issuance never depends on who owns the target
 *   (`ADR-APP4-001` §1.3 rule 4), so there is no field through which a caller
 *   could assert one — and no field a response could echo.
 * - **No `sessionId`.** The column exists (REL-007, nullable) and B03 does not
 *   fill it. A session id is a public path value in APP3; its *credential* is a
 *   cookie the `DesignSessionGuard` checks. Accepting the id alone would let any
 *   caller bind a challenge to a session it does not hold, and applying that
 *   guard would make this endpoint session-only — which `STEP_UP` is not.
 *   Binding therefore belongs with the checkpoint that authorizes and consumes
 *   it (`APP4-B04`); the repository carries the field forward on a resend, so
 *   nothing here forecloses it.
 *
 * The **resend** operation has no body at all. Its target is read from the
 * source challenge, because accepting a contact would turn a resend into an
 * unauthenticated redirect of someone else's code.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * Upper bound on an as-entered contact.
 *
 * Generous, and only a denial-of-service bound: the real judgement is P01's
 * normalizer, which is the one authority on what a usable address is. A tighter
 * limit here would be a second, weaker copy of that rule.
 */
const MAX_CONTACT_LENGTH = 254;

export const issueVerificationChallengeSchema = z
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
          'The destination as entered. Normalized server-side by the canonical rules; ' +
          'never echoed back.',
        example: 'nguoi.dung@example.com',
      }),
    purpose: z.enum(['SUBMISSION', 'STEP_UP']).meta({
      description:
        'Why the contact is being verified. `SUBMISSION` precedes customer identity; ' +
        '`STEP_UP` re-proves possession for a sensitive action.',
      example: 'SUBMISSION',
    }),
  })
  .strict()
  .meta({
    id: 'IssueVerificationChallengeBody',
    description: 'Requests a one-time code for a contact destination and purpose.',
  });

export type IssueVerificationChallengeInput = z.infer<typeof issueVerificationChallengeSchema>;

export class IssueVerificationChallengeBody extends createZodDto(
  issueVerificationChallengeSchema,
) {}

/** The challenge in the path. UUID-shaped, matching every other public id. */
export const verificationChallengeIdParamSchema = z
  .object({
    challengeId: z.string().uuid().meta({
      description: 'Identifier of the challenge to replace.',
      example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
    }),
  })
  .strict();

export class VerificationChallengeIdParam extends createZodDto(
  verificationChallengeIdParamSchema,
) {}

registerZodDtos(IssueVerificationChallengeBody, VerificationChallengeIdParam);
