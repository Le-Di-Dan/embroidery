/**
 * The attempt request contract (`APP4-B04` §5).
 *
 * **One field.** Everything else the operation needs is already server-owned:
 * the challenge is in the path, and the destination and purpose come from the
 * persisted row. `.strict()` refuses the rest by construction — no `contact`,
 * which would let a holder of an id redirect a proven verification to an
 * address of their choosing; no `purpose`, which would let a `SUBMISSION` be
 * answered as a `STEP_UP` and satisfy an authority it never earned; no
 * `customerId` or `contactPointId`, which would make identity a caller
 * assertion; no `sessionId`; and no attempt, expiry or limit override.
 *
 * **A string, not a number.** `042315` is a valid code and `42315` is not the
 * same thing — JSON would parse the first as `42315` and silently drop the
 * leading zero, turning one in ten valid codes into a guaranteed mismatch. The
 * pattern is anchored and fixed-width, so a number-shaped value is rejected by
 * the type check before the length rule is ever consulted.
 *
 * The six is the *wire* contract, not a policy fallback: an OpenAPI schema is
 * static by nature and cannot consult `verification.challenge` at request time.
 * The attempt **budget** — the value B04 must never guess — is read from the
 * published policy at the point of use, and nothing about a length here can
 * substitute for it.
 *
 * The submitted value is never echoed. The platform validation pipe maps a Zod
 * issue to `{ field, code, message }` from a closed set and never carries the
 * received value, so a malformed code cannot come back in its own error.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `ADR-APP4-001` §1.3 — six characters, `0`–`9` only. */
const CODE_PATTERN = /^[0-9]{6}$/;

export const submitVerificationAttemptSchema = z
  .object({
    code: z
      .string()
      .regex(CODE_PATTERN)
      .meta({
        description:
          'The six-digit code from the message, exactly as received. Sent as a string so a ' +
          'leading zero survives; never echoed back and never stored.',
        example: '042315',
      }),
  })
  .strict()
  .meta({
    id: 'SubmitVerificationAttemptBody',
    description: 'Answers an open verification challenge.',
  });

export type SubmitVerificationAttemptInput = z.infer<typeof submitVerificationAttemptSchema>;

export class SubmitVerificationAttemptBody extends createZodDto(submitVerificationAttemptSchema) {}

registerZodDtos(SubmitVerificationAttemptBody);
