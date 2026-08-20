/**
 * Request-side validation for the two Admin moderation mutations
 * (`APP5-B05` §4, §10).
 *
 * Both bodies are `.strict()`, and that is the security property rather than a
 * style choice: `adminId`, `customerId`, `actorKind`, `correlationId`,
 * `sequence`, `createdAt`, `occurredAt` and `fromStatus` are all server-owned,
 * and a schema that merely ignored them would accept a body claiming to set one.
 * Sent, any of them is a `400` naming the unrecognised key.
 *
 * ### What the target enum publishes
 *
 * `toStatus` accepts five values: the four `APP5-B05` targets plus
 * `DIGITIZING`, added by `APP6-B06` for `TR-LC11-07`.
 *
 * `QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` are canonical
 * LC-11 states that `APP5-B04` reads truthfully, and they are **not** here:
 * `APP6-G01` §4.1 reaches each of them only as a projection inside the quotation
 * or design transaction that causes it, so no operator commands one and the
 * contract refuses it as malformed input before the request is ever read.
 * `NEW` is absent too — a request exists only by being submitted, and nothing
 * moves back into it.
 *
 * The enum stays a **narrow command list** and is never replaced by the full
 * lifecycle vocabulary: the set of states a request can be *in* and the set an
 * operator may *ask for* are different sets, and conflating them is how the four
 * projection-only states would become selectable.
 *
 * The **requirement matrix** deliberately does not live here. Which reason texts
 * a target needs and which note kind explains it is decided by
 * `request-moderation.policy.ts` against the state the request is actually in,
 * and duplicating half of it as a `superRefine` would create a second authority
 * that can disagree with the first.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import {
  APP5_NOTE_KINDS,
  APP5_TRANSITION_TARGETS,
} from '../../domain/moderation/request-moderation.policy';

/** UUID path parameter — rejected before any repository call. */
export const moderationRequestIdParamSchema = z.object({ requestId: z.string().uuid() }).strict();

export class ModerationRequestIdParam extends createZodDto(moderationRequestIdParamSchema) {}

/**
 * One written justification.
 *
 * Trimmed, then required to be non-empty, so a body of spaces is a missing
 * reason rather than a reason nobody can read. Bounded at 2000 characters: the
 * columns are `text` and impose no limit of their own, and an unbounded body is
 * a write amplification an authenticated operator should still not be able to
 * perform by accident.
 */
const moderationTextSchema = z.string().trim().min(1).max(2_000);

export const appendModerationNoteBodySchema = z
  .object({
    kind: z.enum(APP5_NOTE_KINDS),
    note: moderationTextSchema,
  })
  .strict();

export class AppendModerationNoteBody extends createZodDto(appendModerationNoteBodySchema) {}

export const transitionCustomRequestBodySchema = z
  .object({
    toStatus: z.enum(APP5_TRANSITION_TARGETS),
    internalReason: moderationTextSchema.optional(),
    customerVisibleReason: moderationTextSchema.optional(),
    moderationNote: moderationTextSchema.optional(),
    moderationNoteKind: z.enum(APP5_NOTE_KINDS).optional(),
  })
  .strict();

export class TransitionCustomRequestBody extends createZodDto(transitionCustomRequestBodySchema) {}

registerZodDtos(ModerationRequestIdParam, AppendModerationNoteBody, TransitionCustomRequestBody);
