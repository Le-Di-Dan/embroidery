/**
 * The two display formatters on this route that are **not** about money.
 *
 * They live apart from `exact-order-amount.ts` deliberately. That module is
 * governed by one absolute rule — no numeric coercion of any kind ever touches
 * an amount — and this feature's boundary suite proves it by scanning for
 * `Number(`, `parseFloat`, `parseInt` and `toFixed` across the source. A byte
 * count and a timestamp legitimately need arithmetic, so putting them in a file
 * whose name says what it holds is what lets that guard stay absolute instead
 * of becoming a list of exceptions nobody can audit.
 *
 * Neither function is ever applied to `fullPaymentAmount`, `payableTotal`,
 * `merchandiseSubtotal` or `feeAmount`, and neither is exported to anything
 * that handles one.
 */
import { formatDisplayInstant } from '@embroidery/i18n';

/**
 * A server-measured byte count, for reading.
 *
 * `byteSize` is what the server counted, never what the browser declared. One
 * decimal and a Vietnamese decimal comma, matching the approved evidence rows;
 * a file under 0.1 MB is shown in kilobytes rather than as `0,0 MB`, which
 * would read as an empty upload.
 */
export function formatByteSize(byteSize: number): string {
  const megabytes = byteSize / (1024 * 1024);
  if (megabytes >= 0.1) {
    return `${megabytes.toFixed(1).replace('.', ',')} MB`;
  }
  const kilobytes = byteSize / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

/**
 * An ISO instant in the product's one display form, `dd/MM/yyyy · HH:mm`.
 *
 * ## Why the shape changed
 *
 * This route used to print `HH:mm ngày dd/MM/yyyy`, hand-assembled from `Date`
 * parts, while the Admin printed the same class of instant through
 * `Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' })` and three other
 * surfaces used three further variants. `V01-UX-021` recorded the result: an
 * operator reading an order beside the customer's own page had to work out
 * which convention each screen was using. `APP12-V02` §30 makes one format
 * canonical, and it lives in `@embroidery/i18n` so there is nothing left to
 * disagree with.
 *
 * ## Why the zone is now the store's
 *
 * The previous implementation used the **viewer's** zone. `formatDisplayInstant`
 * pins `Asia/Ho_Chi_Minh` instead, and that is the correction rather than a
 * regression: the deadline being displayed is when *the workshop* releases the
 * reserved stock, so the workshop's clock is the one both sides must read. A
 * customer travelling abroad and the operator handling their order now see the
 * same string for the same instant.
 *
 * Nothing about *stored* time changed (§30 forbids it): this is presentation,
 * the server remains the authority for the instants themselves, and no duration
 * is computed here. A countdown on a payment surface stays forbidden
 * (`APP9-S01` §9's rule, kept), and §29's rule holds — expiry is the server's
 * published `terminationReason`, never something derived from this timestamp.
 *
 * An unparseable value comes back verbatim rather than as `Invalid Date`: an
 * unexpected server string shown as it is beats a placeholder that reads like a
 * bug in the customer's order.
 */
export function formatInstant(iso: string): string {
  return formatDisplayInstant(iso) ?? iso;
}
