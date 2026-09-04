/**
 * Representative catalog/gallery imagery for the `APP12-H05` performance
 * measurement fixture.
 *
 * `APP12-H05` §5 forbids measuring an image-free catalog and calling the result
 * production performance, and §13 asks for image request count, transferred
 * bytes, intrinsic vs rendered dimensions, format and responsive candidates. All
 * four of those are properties of the *bytes*, so the fixture has to produce
 * real encoded images at realistic weights rather than 1×1 placeholders — a
 * placeholder catalog would report an image budget of a few kilobytes and prove
 * nothing about the one that ships.
 *
 * The images are synthetic (§5: synthetic data only), encoded through the same
 * WebP policy the delivered pipeline uses (`APP2-W01`,
 * `PUBLIC_MEDIA_CONTENT_TYPE`).
 *
 * ## Why the field is calibrated rather than simply random
 *
 * The compressibility of the source decides the payload numbers, so an
 * uncalibrated source silently decides the verdict. Both extremes were measured
 * before this constant was chosen:
 *
 * ```text
 * flat colour / smooth gradient    800px ≈ 11 KiB   1600px ≈  26 KiB
 * unstructured noise               800px ≈ 256 KiB  1600px ≈ 1022 KiB
 * NOISE_AMPLITUDE (0.07)           800px ≈  80 KiB  1600px ≈  300 KiB
 * ```
 *
 * A gradient would understate every image budget to the point of proving
 * nothing; pure noise is incompressible and would manufacture a payload failure
 * that says nothing about the application, which §19 names `FALSE_POSITIVE`. The
 * field is therefore low-frequency structure — what a photograph mostly is, and
 * what WebP actually compresses — plus a bounded noise term calibrated so a
 * catalog image lands in the byte range a well-produced product photograph
 * occupies at these dimensions.
 *
 * A small pool of distinct source images is generated once and reused across
 * assets under distinct storage keys. Every asset therefore carries genuinely
 * representative bytes, and the fixture does not spend minutes encoding several
 * hundred unique images to prove the same byte budget.
 */
import { createHash } from 'node:crypto';

/** The two catalog display derivatives the public renditions map to. */
export const H05_DERIVATIVE_SPECS = Object.freeze([
  Object.freeze({ kind: 'THUMBNAIL', rendition: 'thumbnail', edgePx: 800 }),
  Object.freeze({ kind: 'CATALOG_PREVIEW', rendition: 'catalog-preview', edgePx: 1600 }),
]);

/** The media type every catalog derivative carries (`PUBLIC_MEDIA_CONTENT_TYPE`). */
export const H05_MEDIA_TYPE = 'image/webp';

/** How many distinct source images the pool holds. */
export const H05_IMAGE_POOL_SIZE = 12;

/** The calibrated noise term. See the header table before changing it. */
const NOISE_AMPLITUDE = 0.07;

/**
 * A deterministic structure-plus-noise RGB field.
 *
 * Seeded by index so a re-run of the fixture produces byte-identical images and
 * a payload comparison between two runs measures the application rather than the
 * generator.
 */
function rawField(edgePx, seed) {
  const channels = 3;
  const buffer = Buffer.allocUnsafe(edgePx * edgePx * channels);
  // A cheap deterministic PRNG. Not cryptographic and not required to be: the
  // only properties that matter are the calibrated amplitude and repeatability.
  let state = (seed + 1) * 0x9e3779b1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  const lowFrequency = 3 + (seed % 4);
  const midFrequency = 7 + (seed % 5);
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(255 * value)));
  for (let y = 0; y < edgePx; y += 1) {
    for (let x = 0; x < edgePx; x += 1) {
      const offset = (y * edgePx + x) * channels;
      const u = x / edgePx;
      const v = y / edgePx;
      const a =
        0.5 +
        0.25 * Math.sin(lowFrequency * Math.PI * u + seed) * Math.cos(midFrequency * Math.PI * v);
      const b = 0.5 + 0.25 * Math.sin(midFrequency * Math.PI * v * u + seed);
      const noise = (next() - 0.5) * NOISE_AMPLITUDE;
      buffer[offset] = clamp(a + noise);
      buffer[offset + 1] = clamp(b + noise);
      buffer[offset + 2] = clamp(0.5 * (a + b) + noise);
    }
  }
  return buffer;
}

/**
 * Encodes the pool.
 *
 * @param {{ sharp: unknown, log?: (msg: string) => void }} params
 * @returns {Promise<ReadonlyArray<ReadonlyArray<{ kind: string, rendition: string, widthPx: number, heightPx: number, body: Buffer, checksum: string }>>>}
 */
export async function generateH05ImagePool({ sharp, log = () => {} }) {
  const pool = [];
  for (let seed = 0; seed < H05_IMAGE_POOL_SIZE; seed += 1) {
    const renditions = [];
    for (const spec of H05_DERIVATIVE_SPECS) {
      const raw = rawField(spec.edgePx, seed);
      const body = await sharp(raw, {
        raw: { width: spec.edgePx, height: spec.edgePx, channels: 3 },
      })
        .webp({ quality: 80 })
        .toBuffer();
      renditions.push({
        kind: spec.kind,
        rendition: spec.rendition,
        widthPx: spec.edgePx,
        heightPx: spec.edgePx,
        body,
        checksum: `sha256:${createHash('sha256').update(body).digest('hex')}`,
      });
    }
    pool.push(Object.freeze(renditions));
  }
  const bytes = pool.flat().reduce((total, item) => total + item.body.byteLength, 0);
  log(
    `generated ${String(pool.length)} source images ` +
      `(${String(pool.flat().length)} derivatives, ${String(Math.round(bytes / 1024))} KiB total)`,
  );
  return Object.freeze(pool);
}
