/**
 * The one field any transition on this screen accepts, and the local check that
 * keeps a request the server is certain to refuse off the wire (`786:150`).
 *
 * ## Why this validates at all
 *
 * `PRODUCTION_CANCELLATION_REASON_REQUIRED` is a published `400`: `APP8-B04`
 * refuses a cancellation with no reason, and the contract bounds the field at
 * 1–1000 characters. Blocking in place is not the client claiming authority —
 * the server still validates every submitted transition — it is the client
 * declining to send a command whose only possible outcome is a refusal.
 *
 * ## Whitespace is not a reason
 *
 * The reason is permanent evidence written into the append-only transition
 * history. A string of spaces would satisfy a naive length check and record
 * nothing, so the value is trimmed before it is measured **and** before it is
 * sent: what the operator sees accepted is exactly what is stored.
 *
 * ## Start and Complete have no reason at all
 *
 * They are not modelled here and must not be. `787:88` records that sending
 * `reason` with `STARTED` or `COMPLETED` is refused with a `400`, which is why
 * those two dialogs carry no field rather than an optional one.
 */

/** The contract bound on `TransitionProductionJobBody.reason`. */
export const CANCELLATION_REASON_MAX_LENGTH = 1000;

export type CancellationReasonError = 'required' | 'tooLong';

export type CancellationReasonValidation =
  | { readonly ok: true; readonly reason: string }
  | { readonly ok: false; readonly error: CancellationReasonError };

export function validateCancellationReason(raw: string): CancellationReasonValidation {
  const reason = raw.trim();
  if (reason.length === 0) return { ok: false, error: 'required' };
  if (reason.length > CANCELLATION_REASON_MAX_LENGTH) return { ok: false, error: 'tooLong' };
  return { ok: true, reason };
}
