/**
 * How the final-payment QR is delivered (`APP9-B02` §9).
 *
 * The transport is `APP7-B03`'s, re-exported rather than restated: the content
 * type, the never-cache rule and the sniffing defence are properties of *a
 * payment QR served under a secure link*, not of the deposit, and a second copy
 * of them could drift. Only the saved filename is this surface's own.
 *
 * The operation is zero-write for the reason the deposit's is: every input is
 * deterministic and immutable for the life of the obligation, so the image is
 * regenerated exactly on each request and no object, asset or storage key
 * exists for it.
 */
export {
  DEPOSIT_QR_CONTENT_TYPE as FINAL_PAYMENT_QR_CONTENT_TYPE,
  DEPOSIT_QR_CACHE_CONTROL as FINAL_PAYMENT_QR_CACHE_CONTROL,
  DEPOSIT_QR_CONTENT_TYPE_OPTIONS as FINAL_PAYMENT_QR_CONTENT_TYPE_OPTIONS,
} from '../deposit/deposit-qr.policy';

/**
 * The saved file's name.
 *
 * A fixed, safe token carrying no order code, no memo and no customer fact, so
 * a downloaded file sitting in a shared Downloads folder names nothing about the
 * order it pays for. It is distinct from the deposit's only so that a customer
 * who saved both can tell them apart in their own folder.
 */
export const FINAL_PAYMENT_QR_FILENAME = 'final-payment-transfer-qr.png';

/** `attachment`, so the browser offers a save rather than replacing the page. */
export const FINAL_PAYMENT_QR_CONTENT_DISPOSITION = `attachment; filename="${FINAL_PAYMENT_QR_FILENAME}"`;
