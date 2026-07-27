/**
 * Filename normalization for the request fingerprint (`APP2-B01` §8).
 *
 * The normalized name exists for exactly one purpose: to make the fingerprint
 * stable across clients that send `C:\Users\x\logo.png`, `/tmp/logo.png` and
 * `logo.png` for the same upload. It is **never** stored — not in the object
 * key, not in the idempotency result, not in an API response, not in a log —
 * because a filename is user-controlled text that routinely carries a person's
 * name, a customer's name or a directory layout.
 *
 * Only the last path segment survives, so a traversal segment cannot reach a
 * key builder even by accident; the key builders reject one independently.
 */
import { assetIntakeError } from './asset-intake.errors';

/** UTF-8 bytes, not characters: the bound is a storage bound. */
const MAX_FILENAME_BYTES = 255;

const ASCII_SPACE = 0x20;
const ASCII_DELETE = 0x7f;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < ASCII_SPACE || codePoint === ASCII_DELETE) {
      return true;
    }
  }
  return false;
}

/**
 * Applies the eight normalization steps in order, or throws
 * `ASSET_UPLOAD_METADATA_INVALID`.
 *
 * Case is preserved: two uploads differing only in filename case are two
 * different requests, and folding them would make one silently replay the
 * other's result.
 */
export function normalizeFilename(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }
  // Step 1 — NUL and control characters are rejected outright rather than
  // stripped: a name containing them is a malformed or hostile client, and
  // stripping would silently merge two distinct names.
  if (hasControlCharacter(raw)) {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }

  // Steps 2-3 — Windows separators become `/`, then only the basename survives.
  const segments = raw.replace(/\\/g, '/').split('/');
  const basename = segments[segments.length - 1] ?? '';

  // Steps 4-6 — NFC so two byte-different but canonically equal names hash the
  // same, then whitespace is trimmed and internal runs collapsed to one space.
  const collapsed = basename.normalize('NFC').trim().replace(/\s+/gu, ' ');

  // Step 7 — an empty result means the client sent only separators or spaces.
  if (collapsed === '') {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }

  // Step 8 — bounded so a 64 KiB "filename" cannot reach the hash input.
  if (Buffer.byteLength(collapsed, 'utf8') > MAX_FILENAME_BYTES) {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }

  return collapsed;
}
