/**
 * Request-side validation for the one Admin production transition
 * (`APP8-B04` §3, §19).
 *
 * One body with a typed target, `.strict()` like every other schema in this
 * module: an unknown field is a client bug worth reporting.
 *
 * ### Why the reason rule lives here as well as in persistence
 *
 * `ProductionJobRepository.transition` refuses a blank cancellation reason with
 * `CANCELLATION_REASON_REQUIRED`, and that stays the authority — it is the guard
 * a future caller reaching the repository directly would still meet. The
 * `superRefine` below is not a second rule but the same one stated where a
 * client can be told *which field* is wrong, before a connection is taken.
 *
 * It also refuses a `reason` on `STARTED` and `COMPLETED`. Neither transition
 * has anywhere to put one — `production_job_transitions.reason` would carry it,
 * but `TR-LC18-02`/`TR-LC18-03` record no such fact and a silently-dropped field
 * is how an operator believes they recorded something they did not.
 */
import type { ProductionJobState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The three targets `APP8-B04` owns.
 *
 * `PLANNED` is absent because it is not a destination: `TR-LC18-01` creates a
 * job in it and LC-18 has no move back to it. A rerun is a *rework* job with its
 * own id (ADR-DB3-003), which no APP8 checkpoint delivers.
 *
 * A local tuple rather than a runtime import of the ORM schema namespace
 * (`BACKEND_CONVENTIONS.md` §3), tied to the canonical union by `satisfies`.
 */
export const PRODUCTION_TRANSITION_TARGETS = [
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly ProductionJobState[];

export const transitionProductionJobBodySchema = z
  .object({
    to: z.enum(PRODUCTION_TRANSITION_TARGETS),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.to === 'CANCELLED' && value.reason === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required to cancel a production job.',
      });
      return;
    }
    if (value.to !== 'CANCELLED' && value.reason !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Only a cancellation records a reason.',
      });
    }
  });

export class TransitionProductionJobBody extends createZodDto(transitionProductionJobBodySchema) {}

registerZodDtos(TransitionProductionJobBody);
