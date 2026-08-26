/**
 * Request-side validation for the one Admin order lifecycle command
 * (`APP9-B01` §4, §6).
 *
 * One body with a typed target, `.strict()` like every other schema in this
 * module: an unknown field is a client bug worth reporting, and silently
 * dropping one is how an operator believes they recorded something they did not.
 *
 * ### Why the target is a field rather than a verb in the path
 *
 * It is the shape every state machine in this repository already publishes —
 * `POST /api/admin/custom-requests/{requestId}/transitions` and
 * `POST /api/admin/production-jobs/{jobId}/transitions` — so a later LC-14 move
 * joins this operation instead of minting a route per verb. `transitions` is a
 * collection because each accepted command appends an `order_transitions` row:
 * the request creates a transition.
 *
 * ### Why the enum has exactly one member
 *
 * `APP9-B01` owns `TR-LC14-05` and nothing else. `READY_FOR_DELIVERY` is
 * `TR-LC14-06`'s, and it is a *consequence* of Admin final-payment verification
 * rather than a command (`APP9-G01` §3); `DELIVERED` and `COMPLETED` are
 * `APP9-B05`'s guarded dispatch and completion, each with a freeze, a snapshot
 * or a guard this route has no authority over. Publishing them now would be a
 * contract offering moves no code performs. `ON_HOLD` and `CANCELLING` are not
 * here either: both need a reason, and commercial cancellation is deferred
 * whole (`PO-APP9-001 = OPTION A — DEFER`).
 *
 * The enum is therefore honest rather than aspirational, and a later checkpoint
 * widens it by delivering the behaviour behind the value.
 */
import type { OrderState } from '@embroidery/database';
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/**
 * The one target `APP9-B01` owns.
 *
 * A local tuple rather than a runtime import of the ORM schema namespace
 * (`BACKEND_CONVENTIONS.md` §3), tied to the canonical union by `satisfies` so
 * a renamed LC-14 state stops compiling here.
 */
export const ADMIN_ORDER_TRANSITION_TARGETS = [
  'AWAITING_FINAL_PAYMENT',
] as const satisfies readonly OrderState[];

export const transitionAdminOrderBodySchema = z
  .object({ to: z.enum(ADMIN_ORDER_TRANSITION_TARGETS) })
  .strict();

export class TransitionAdminOrderBody extends createZodDto(transitionAdminOrderBodySchema) {}

registerZodDtos(TransitionAdminOrderBody);
