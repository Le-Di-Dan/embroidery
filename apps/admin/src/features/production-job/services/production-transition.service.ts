/**
 * The one `APP8-B04` **write** this screen performs:
 * `adminProductionJob_transition`.
 *
 * It is alone in its own module on purpose. This is the operation that consumes
 * Catalog stock, moves the order through LC-14 and releases holds — the only
 * thing in APP8-A03 that changes anything — and it carries **no idempotency
 * key**. A resend is therefore a *second* command, not a retry of the first, and
 * nothing above this module may re-issue it automatically. Keeping it out of the
 * read module is what makes that visible.
 *
 * ## The body is exactly what the contract defines, and nothing more
 *
 * `{ to }` for a start or a completion, `{ to, reason }` for a cancellation.
 * `787:88` records that sending `reason` alongside `STARTED` or `COMPLETED` is
 * refused with a `400`, so the two reasonless commands are built by a signature
 * that has nowhere to put one. No client-generated id, timestamp, actor or
 * correlation field is added: the server owns every one of them.
 *
 * ## The receipt is read, never trusted as the new screen state
 *
 * `AdminProductionTransitionResultResponse` is returned to the caller because it
 * is genuine post-commit evidence, but the screen re-reads the job detail rather
 * than projecting this into the cache as a substitute. Nothing on screen may be
 * a state the authoritative read has not confirmed (`786:197`).
 */
import {
  adminProductionJobTransition,
  normalizeApiClientError,
  TransitionProductionJobBodyTo,
} from '@embroidery/api-client';
import type {
  AdminProductionTransitionResultResponse,
  TransitionProductionJobBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductionJobApiError } from '../model/production-job-failure';

export interface SubmitProductionTransitionInput {
  readonly jobId: string;
  readonly body: TransitionProductionJobBody;
}

/** `{"to":"STARTED"}` — no reason, because the contract accepts none. */
export function startProductionBody(): TransitionProductionJobBody {
  return { to: TransitionProductionJobBodyTo.STARTED };
}

/** `{"to":"COMPLETED"}` — no reason, because the contract accepts none. */
export function completeProductionBody(): TransitionProductionJobBody {
  return { to: TransitionProductionJobBodyTo.COMPLETED };
}

/** `{"to":"CANCELLED","reason":…}` — the reason is mandatory and already trimmed. */
export function cancelProductionBody(reason: string): TransitionProductionJobBody {
  return { to: TransitionProductionJobBodyTo.CANCELLED, reason };
}

export async function submitProductionTransition({
  jobId,
  body,
}: SubmitProductionTransitionInput): Promise<AdminProductionTransitionResultResponse> {
  try {
    const response = await adminProductionJobTransition(jobId, body, {
      instance: getBrowserApiClient(),
    });
    return response.data;
  } catch (error: unknown) {
    throw new ProductionJobApiError(normalizeApiClientError(error));
  }
}
