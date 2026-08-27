/**
 * The two display formatters on this route that are **not** about money.
 *
 * They live apart from `exact-final-amount.ts` deliberately. That module is
 * governed by one absolute rule — no numeric coercion of any kind ever touches
 * an amount — and this feature's boundary suite proves it by scanning for
 * `Number(`, `parseFloat`, `parseInt` and `toFixed` across the source. A byte
 * count and a timestamp legitimately need arithmetic, so putting them in a file
 * whose name says what it holds is what lets that guard stay absolute instead of
 * becoming a list of exceptions nobody can audit.
 *
 * Neither function is ever applied to `finalPaymentAmount`, and neither is
 * exported to anything that handles one.
 */

/**
 * A server-measured byte count, for reading (`817:31`).
 *
 * `byteSize` is what the server counted, never what the browser declared. One
 * decimal and a Vietnamese decimal comma, matching the approved frames; a file
 * under 0.1 MB is shown in kilobytes rather than as `0,0 MB`, which would read
 * as an empty upload.
 */
export function formatByteSize(byteSize: number): string {
  const megabytes = byteSize / (1024 * 1024);
  if (megabytes >= 0.1) {
    return `${megabytes.toFixed(1).replace('.', ',')} MB`;
  }
  const kilobytes = byteSize / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

const TWO_DIGITS = 2;

function pad(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}

/**
 * An ISO instant in the approved `dd/MM/yyyy HH:mm` form (`816:230`).
 *
 * Rendered in the **viewer's** local zone, because every instant on this screen
 * is something the customer is meant to relate to their own day: when their
 * image was received, and when their access link stops working. `Date` is used
 * for the calendar arithmetic and nothing else — no duration is computed, no
 * countdown ticks, and nothing on this route re-renders because time passed.
 * `APP9-S01` §9 forbids a countdown on a payment surface outright.
 *
 * An unparseable value comes back verbatim rather than as `NaN/NaN/NaN`: an
 * unexpected server string shown as it is beats a placeholder that reads like a
 * bug in the customer's order.
 */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
