/**
 * Synthetic raster payloads for the asset-intake suites.
 *
 * Generated, never fixtures: a committed binary would be an unreviewable blob,
 * and a real photograph would put someone's data in the repository. These carry
 * a valid signature and arbitrary filler, which is all the intake path
 * inspects — deep decoding is `APP2-W01`'s job.
 */
import { randomBytes } from 'node:crypto';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/** Deterministic filler so a fixed `seed` always yields identical bytes. */
function filler(size: number, seed: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = (index * 31 + seed) % 256;
  }
  return bytes;
}

export function pngBytes(size = 64, seed = 1): Buffer {
  return Buffer.concat([PNG_MAGIC, filler(Math.max(size - PNG_MAGIC.length, 0), seed)]);
}

export function jpegBytes(size = 64, seed = 2): Buffer {
  return Buffer.concat([JPEG_MAGIC, filler(Math.max(size - JPEG_MAGIC.length, 0), seed)]);
}

/** RIFF container: `RIFF` + size + `WEBP`, which is what the sniffer reads. */
export function webpBytes(size = 64, seed = 3): Buffer {
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(Math.max(size - 8, 0), 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, filler(Math.max(size - 12, 0), seed)]);
}

/** An SVG document — valid XML, and rejected at intake by policy. */
export function svgBytes(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
}

/** Bytes that match no signature in the allowlist. */
export function randomNonImageBytes(size = 64): Buffer {
  const bytes = randomBytes(size);
  // Guarantee the first byte cannot start a PNG or JPEG signature.
  bytes[0] = 0x00;
  return bytes;
}

export const MEDIA_BUILDERS = {
  'image/png': pngBytes,
  'image/jpeg': jpegBytes,
  'image/webp': webpBytes,
} as const;
