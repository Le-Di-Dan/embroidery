/**
 * Feature service seam over the two `APP5-B05` **mutations**:
 * `adminCustomRequest_transition` and `adminCustomRequest_appendNote`.
 *
 * Kept apart from the read seam because the two have different rules. A read may
 * be re-issued freely; neither of these may. Both are deliberate operator
 * actions with a durable, append-only record behind them — a transition writes
 * TBL-042 history and raises an outbox event, and a note is a row that cannot be
 * edited or removed — so nothing on this path retries, and the callers disable
 * the control that is in flight.
 *
 * The bodies are built in the model and arrive here already shaped as the
 * generated types. This module adds no field: it cannot, because the generated
 * body types have no member for an actor, a source state or a correlation id.
 */
import {
  adminCustomRequestAppendNote,
  adminCustomRequestTransition,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AppendModerationNoteBody, TransitionCustomRequestBody } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomRequestDetailApiError } from '../model/custom-request-detail-failure';

/**
 * Performs one moderation decision.
 *
 * The response is a receipt, not a new source of truth: the caller re-reads
 * `APP5-B04` and renders the persisted result. Building the new status, history
 * row or note from what this returns is how a screen shows a transition the
 * database does not have.
 */
export async function transitionCustomRequest(
  requestId: string,
  body: TransitionCustomRequestBody,
): Promise<void> {
  try {
    await adminCustomRequestTransition(requestId, body, { instance: getBrowserApiClient() });
  } catch (error: unknown) {
    throw new CustomRequestDetailApiError(normalizeApiClientError(error));
  }
}

/** Appends one internal note. Append-only: there is no edit and no delete route. */
export async function appendModerationNote(
  requestId: string,
  body: AppendModerationNoteBody,
): Promise<void> {
  try {
    await adminCustomRequestAppendNote(requestId, body, { instance: getBrowserApiClient() });
  } catch (error: unknown) {
    throw new CustomRequestDetailApiError(normalizeApiClientError(error));
  }
}
