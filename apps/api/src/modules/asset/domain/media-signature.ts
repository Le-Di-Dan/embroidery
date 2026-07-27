/**
 * Magic-byte validation for the raster allowlist (`APP2-B01` §10).
 *
 * A declared `Content-Type` is client text; it decides nothing on its own. The
 * signature check is what stops an SVG, a ZIP or a script being stored under
 * `image/png` and later handed to an image decoder — and it runs on a **bounded
 * prefix**, before any byte is sent to object storage, so a rejected upload
 * never produces a stored object.
 *
 * The prefix is 12 bytes because WebP needs bytes 8-11 (`WEBP`) in addition to
 * its `RIFF` header; PNG needs 8 and JPEG needs 3.
 */
import { assetIntakeError } from './asset-intake.errors';
import { isAcceptedMediaType, type AcceptedMediaType } from './asset-intake.policy';

/** Enough for the longest signature in the allowlist. */
export const SIGNATURE_PREFIX_BYTES = 12;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_MAGIC = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');

/**
 * Identifies the media type of a prefix, or `undefined` when it matches none of
 * the three. An unrecognised prefix is never "probably fine".
 */
export function detectMediaType(prefix: Buffer): AcceptedMediaType | undefined {
  if (prefix.length >= PNG_MAGIC.length && prefix.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  if (
    prefix.length >= JPEG_MAGIC.length &&
    prefix.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)
  ) {
    return 'image/jpeg';
  }
  if (
    prefix.length >= SIGNATURE_PREFIX_BYTES &&
    prefix.subarray(0, 4).equals(RIFF_MAGIC) &&
    prefix.subarray(8, 12).equals(WEBP_MAGIC)
  ) {
    return 'image/webp';
  }
  return undefined;
}

/** Rejects a declared type outside the closed allowlist (this is where SVG dies). */
export function assertAcceptedMediaType(declared: string): AcceptedMediaType {
  if (!isAcceptedMediaType(declared)) {
    throw assetIntakeError('ASSET_UPLOAD_MEDIA_UNSUPPORTED');
  }
  return declared;
}

/**
 * Confirms the bytes are what the client said they are.
 *
 * The validated type is returned rather than the declared one so callers cannot
 * accidentally keep using client input — even though the two are equal by the
 * time this returns. They must be equal: the object key was already allocated
 * from the declared type, so a divergence would put the wrong extension on a
 * stored object (`ADR-APP2-001` §4.2f-1).
 */
export function assertSignatureMatches(
  declared: AcceptedMediaType,
  prefix: Buffer,
): AcceptedMediaType {
  const detected = detectMediaType(prefix);
  if (detected === undefined || detected !== declared) {
    throw assetIntakeError('ASSET_UPLOAD_SIGNATURE_MISMATCH');
  }
  return detected;
}
