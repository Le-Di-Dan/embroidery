/**
 * The worker-side recipient mask for logs (`APP12-N01.B01` §9).
 *
 * `notification_intents.recipient_masked` already stores the API's mask
 * (`ADR-APP4-001` PO-03), but a delivery adapter holds the **normalized**
 * recipient — it has to, in order to address the message — and the moment it
 * writes a log line about that delivery it needs a form that is safe to keep.
 *
 * This is deliberately a *log* mask and not a second copy of the APP4 masking
 * authority: nothing it produces is persisted, returned or shown to a customer,
 * and no response field is rendered from it. It exists so a failure line is
 * diagnosable — enough to tell two recipients apart while a run is being read —
 * without putting an address in a log file that outlives the incident.
 *
 * The email rule mirrors PO-03's shape: first code point of the local part, then
 * `***`, domain preserved. `Array.from` rather than indexing, so a multi-byte
 * first character is not split into a mojibake half.
 */

/** A log-safe form of a normalized recipient. Never persisted, never returned. */
export function maskRecipient(value: string): string {
  if (typeof value !== 'string' || value === '') {
    return '';
  }
  const at = value.lastIndexOf('@');
  if (at <= 0) {
    // Not an address shape. Keep the extremes only — enough to distinguish two
    // values in one log, never enough to reconstruct either.
    const points = Array.from(value);
    return points.length <= 2 ? '***' : `${points[0]}***${points[points.length - 1]}`;
  }
  const local = Array.from(value.slice(0, at));
  return `${local[0]}***${value.slice(at)}`;
}
