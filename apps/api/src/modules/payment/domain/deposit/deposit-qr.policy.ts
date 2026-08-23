/**
 * How the deposit QR is delivered (`APP7-B03` §19).
 *
 * The operation is **zero-write**: no QR bytes, object, asset, derivative or
 * storage key is persisted, no Asset row is created and object storage is not
 * involved at all. Every input is deterministic and immutable for the life of
 * the obligation, so the image is regenerated exactly on each request and a
 * stored binary would only be a second thing to keep in sync.
 */

/** PNG: universally renderable in a browser and saveable from one. */
export const DEPOSIT_QR_CONTENT_TYPE = 'image/png';

/**
 * The saved file's name.
 *
 * A fixed, safe token: no order code, no reference and no customer fact, so a
 * downloaded file sitting in a shared Downloads folder names nothing about the
 * order it pays for. It contains no character that would need quoting, so the
 * header below cannot be broken by the value.
 */
export const DEPOSIT_QR_FILENAME = 'deposit-transfer-qr.png';

/**
 * `attachment`, so the browser offers a save rather than replacing the deposit
 * screen when the image is opened directly. `APP7-B03` §19 requires the QR to be
 * downloadable, and this is what makes it so.
 */
export const DEPOSIT_QR_CONTENT_DISPOSITION = `attachment; filename="${DEPOSIT_QR_FILENAME}"`;

/**
 * Never cached. The bytes are stable but the authorization around them is not —
 * a revoked grant must stop delivering immediately, and a proxy or disk cache
 * holding a payment instruction would outlive the link that authorized it.
 */
export const DEPOSIT_QR_CACHE_CONTROL = 'no-store';

export const DEPOSIT_QR_CONTENT_TYPE_OPTIONS = 'nosniff';

/**
 * The rendered module size, in pixels.
 *
 * Large enough that a phone camera resolves the payload from a laptop screen at
 * arm's length, which is the actual scanning situation.
 */
export const DEPOSIT_QR_MODULE_SCALE = 8;

/** Quiet zone, in modules. Four is the QR specification's minimum. */
export const DEPOSIT_QR_MARGIN_MODULES = 4;
