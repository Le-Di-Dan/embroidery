/**
 * Synthetic images for the asset-processing suites (APP2-W01 §21).
 *
 * Generated rather than committed as binaries: a checked-in fixture is a blob
 * nobody can review, and every property these suites assert — the exact size,
 * the alpha channel, the EXIF orientation, the frame count — is visible here as
 * code. They are also genuinely decodable files, not byte patterns that merely
 * start with the right magic number.
 *
 * Test-only. Build-excluded via `src/**\/tests/**`.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export interface SyntheticImage {
  readonly bytes: Buffer;
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly byteSize: number;
  readonly checksum: string;
}

export function checksumOf(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function describe(bytes: Buffer, mediaType: SyntheticImage['mediaType']): SyntheticImage {
  return { bytes, mediaType, byteSize: bytes.length, checksum: checksumOf(bytes) };
}

/** An RGBA PNG with a genuinely translucent background, so alpha is testable. */
export async function pngWithAlpha(width = 1200, height = 800): Promise<SyntheticImage> {
  const bytes = await sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  return describe(bytes, 'image/png');
}

export async function jpeg(width = 900, height = 600): Promise<SyntheticImage> {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: '#336699' },
  })
    .jpeg()
    .toBuffer();
  return describe(bytes, 'image/jpeg');
}

export async function staticWebp(width = 640, height = 480): Promise<SyntheticImage> {
  const bytes = await sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 0.9 } },
  })
    .webp()
    .toBuffer();
  return describe(bytes, 'image/webp');
}

/**
 * A real two-frame animated WebP.
 *
 * Built by joining two distinct stills, which is the only construction that
 * produces a container libvips reports as multi-page — an earlier attempt using
 * the `pageHeight` output option produced a perfectly ordinary still image, and
 * the rejection test would have passed for the wrong reason.
 */
export async function animatedWebp(): Promise<SyntheticImage> {
  const frames = await Promise.all([
    sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer(),
    sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer(),
  ]);
  const bytes = await sharp(frames, { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  return describe(bytes, 'image/webp');
}

/** A JPEG carrying EXIF orientation 6 — a viewer must rotate it a quarter turn. */
export async function exifRotatedJpeg(width = 200, height = 100): Promise<SyntheticImage> {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#0a0' } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  return describe(bytes, 'image/jpeg');
}

/**
 * Over the 40-megapixel ceiling with *both* sides inside 12,000: 8000 × 6000 is
 * 48 megapixels. Chosen that way so this fixture can only trip the pixel rule —
 * a 12001-wide image would hit the dimension rule first and the test would have
 * proved the wrong check.
 */
export async function overPixelLimitPng(): Promise<SyntheticImage> {
  const bytes = await sharp({
    create: { width: 8_000, height: 6_000, channels: 3, background: '#000' },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return describe(bytes, 'image/png');
}

/** Wider than 12,000 but only 1.25 megapixels, so only the dimension rule fires. */
export async function overDimensionLimitPng(): Promise<SyntheticImage> {
  const bytes = await sharp({
    create: { width: 12_500, height: 100, channels: 3, background: '#000' },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return describe(bytes, 'image/png');
}

/** A valid header followed by truncated pixel data: decodes, then fails. */
export async function truncatedPng(): Promise<SyntheticImage> {
  const full = await pngWithAlpha(300, 200);
  const bytes = full.bytes.subarray(0, Math.floor(full.bytes.length * 0.6));
  return describe(Buffer.from(bytes), 'image/png');
}

/** Not an image at all. */
export function garbage(): SyntheticImage {
  const bytes = Buffer.from('this is definitely not an image', 'utf8');
  return describe(bytes, 'image/png');
}

/** Smaller than both bounding boxes, to prove nothing is upscaled. */
export async function tinyPng(): Promise<SyntheticImage> {
  return pngWithAlpha(40, 30);
}
