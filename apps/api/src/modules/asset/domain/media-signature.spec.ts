/**
 * Signature detection and the closed media allowlist.
 *
 * This is the boundary that decides whether bytes ever reach object storage, so
 * every case here is about refusing rather than accepting: a declared type that
 * is not allowlisted, a declaration that does not match the bytes, and the
 * SVG that policy rejects outright.
 */
import {
  jpegBytes,
  pngBytes,
  randomNonImageBytes,
  svgBytes,
  webpBytes,
} from '../../../../test/support/synthetic-images';
import { isAssetIntakeError } from './asset-intake.errors';
import {
  assertAcceptedMediaType,
  assertSignatureMatches,
  detectMediaType,
  SIGNATURE_PREFIX_BYTES,
} from './media-signature';

function codeOf(work: () => unknown): string {
  try {
    work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

describe('detectMediaType', () => {
  it.each([
    ['PNG', pngBytes(), 'image/png'],
    ['JPEG', jpegBytes(), 'image/jpeg'],
    ['WebP', webpBytes(), 'image/webp'],
  ])('identifies %s', (_label, bytes, expected) => {
    expect(detectMediaType(bytes.subarray(0, SIGNATURE_PREFIX_BYTES))).toBe(expected);
  });

  it('identifies a short PNG and JPEG from their minimum prefix', () => {
    expect(detectMediaType(pngBytes().subarray(0, 8))).toBe('image/png');
    expect(detectMediaType(jpegBytes().subarray(0, 3))).toBe('image/jpeg');
  });

  it('returns undefined for an unrecognised prefix', () => {
    expect(detectMediaType(randomNonImageBytes())).toBeUndefined();
    expect(detectMediaType(svgBytes())).toBeUndefined();
    expect(detectMediaType(Buffer.alloc(0))).toBeUndefined();
  });

  it('does not accept a RIFF container that is not WebP', () => {
    // `RIFF....WAVE` is a valid RIFF file and must not pass as an image.
    const wave = Buffer.alloc(16);
    wave.write('RIFF', 0, 'ascii');
    wave.write('WAVE', 8, 'ascii');
    expect(detectMediaType(wave)).toBeUndefined();
  });

  it('needs the full 12 bytes before WebP is decidable', () => {
    expect(detectMediaType(webpBytes().subarray(0, 11))).toBeUndefined();
  });
});

describe('assertAcceptedMediaType', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (declared) => {
    expect(assertAcceptedMediaType(declared)).toBe(declared);
  });

  it.each([
    'image/svg+xml',
    'image/gif',
    'image/tiff',
    'application/octet-stream',
    'text/plain',
    'IMAGE/PNG',
    'image/png; charset=utf-8',
    '',
  ])('rejects %s', (declared) => {
    expect(codeOf(() => assertAcceptedMediaType(declared))).toBe('ASSET_UPLOAD_MEDIA_UNSUPPORTED');
  });
});

describe('assertSignatureMatches', () => {
  it('accepts bytes that match their declaration', () => {
    expect(assertSignatureMatches('image/png', pngBytes())).toBe('image/png');
    expect(assertSignatureMatches('image/webp', webpBytes())).toBe('image/webp');
  });

  it('rejects a PNG declaration carrying JPEG bytes', () => {
    expect(codeOf(() => assertSignatureMatches('image/png', jpegBytes()))).toBe(
      'ASSET_UPLOAD_SIGNATURE_MISMATCH',
    );
  });

  it('rejects SVG bytes declared as PNG', () => {
    // The declared type is allowlisted, so only the signature check stops this.
    expect(codeOf(() => assertSignatureMatches('image/png', svgBytes()))).toBe(
      'ASSET_UPLOAD_SIGNATURE_MISMATCH',
    );
  });

  it('rejects unrecognised bytes', () => {
    expect(codeOf(() => assertSignatureMatches('image/jpeg', randomNonImageBytes()))).toBe(
      'ASSET_UPLOAD_SIGNATURE_MISMATCH',
    );
  });
});
