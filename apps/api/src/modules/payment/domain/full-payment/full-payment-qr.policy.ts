/**
 * How the full-payment QR is delivered (`APP12-B04` §17).
 *
 * The transport is `APP7-B03`'s, re-exported rather than restated — exactly as
 * `final-payment-qr.policy.ts` re-exports it. The content type, the never-cache
 * rule and the sniffing defence are properties of *a payment QR served under a
 * secure link*, not of any one obligation kind, and a third copy of them could
 * drift. Only the saved filename is this surface's own.
 *
 * The operation is zero-write for the reason the other two are: every input is
 * deterministic and immutable for the life of the obligation, so the image is
 * regenerated exactly on each request and no object, asset or storage key
 * exists for it.
 */
export {
  DEPOSIT_QR_CONTENT_TYPE as FULL_PAYMENT_QR_CONTENT_TYPE,
  DEPOSIT_QR_CACHE_CONTROL as FULL_PAYMENT_QR_CACHE_CONTROL,
  DEPOSIT_QR_CONTENT_TYPE_OPTIONS as FULL_PAYMENT_QR_CONTENT_TYPE_OPTIONS,
} from '../deposit/deposit-qr.policy';

/**
 * The saved file's name.
 *
 * A fixed, safe token carrying no order code, no memo and no customer fact, so
 * a downloaded file sitting in a shared Downloads folder names nothing about
 * the order it pays for. It is distinct from the other two only so a customer
 * who saved more than one can tell them apart in their own folder.
 */
export const FULL_PAYMENT_QR_FILENAME = 'order-payment-transfer-qr.png';

/** `attachment`, so the browser offers a save rather than replacing the page. */
export const FULL_PAYMENT_QR_CONTENT_DISPOSITION = `attachment; filename="${FULL_PAYMENT_QR_FILENAME}"`;
