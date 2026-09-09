/**
 * Source imagery for the `APP12-G03` persistent UAT catalog.
 *
 * ## Why this file exists at all
 *
 * `APP12-G03` §8 asks for *real* media: bytes the application actually stored,
 * inspected and derived from, not placeholder rectangles or fabricated URLs. Its
 * preference order is the operator's own product photographs first, then
 * repository-owned sources, then repository-owned generated imagery. The
 * repository owns no product photographs — only the `APP12-H05`/`H06` generators,
 * and those produce **derivatives** (800 px and 1600 px WebP written straight to
 * storage), which is the wrong end of the pipeline for G03: the whole point here
 * is that the image enters through `adminAsset_upload` and the delivered worker
 * makes the derivatives. So G03 generates **sources**, and the Product Owner
 * chose that option in session on 2026-09-09.
 *
 * Downloading imagery from the internet is forbidden by §8 and nothing here does
 * any network I/O.
 *
 * ## What the picture has to be good for
 *
 * Three jobs, and each one rules out the obvious cheap answer:
 *
 * 1. **It must survive the pipeline honestly.** A 1×1 pixel or a flat fill
 *    compresses to nothing, and the resulting Asset would prove that the upload
 *    route works while proving nothing about what a catalog weighs. So the ground
 *    carries real high-frequency structure — a woven texture — and the encoded
 *    source lands in the range a phone photograph of a small product occupies.
 * 2. **A human has to be able to tell two images apart.** §7 asks that the stored
 *    order and the public order agree after an operator reorders the gallery, and
 *    §13 asks a person to look at the result. Twenty images that differ only by
 *    noise seed are twenty identical images to the eye, and the reviewer would be
 *    reduced to trusting the manifest. Every image therefore carries a distinct
 *    thread hue *and* a distinct petal count, both legible at thumbnail size.
 * 3. **It must not pretend to be a photograph.** G03 data is `UAT_ONLY` (§18).
 *    A generated motif on woven ground reads immediately as a stand-in, which is
 *    the honest thing for a dataset nobody may promote to production.
 *
 * ## The picture
 *
 * A square of linen — warm off-white, a real over/under weave, a soft vignette —
 * carrying a radially symmetric rosette worked in two thread colours, plus a row
 * of stitch dots underneath whose count is the image's own position in its
 * gallery. Everything is drawn from arithmetic into a raw RGB buffer; there is no
 * font, no SVG and no asset file, so the module has exactly one dependency and it
 * is the one `apps/worker` already declares.
 *
 * Deterministic: the same `(seed, position)` always produces byte-identical
 * output, so a re-run of the seeder (§17) uploads the same picture rather than a
 * new one that merely looks similar.
 */

/** The edge of a generated source image, in pixels. */
export const SOURCE_EDGE_PX = 1600;

/** JPEG quality. High enough that the worker's WebP pass is not re-encoding mush. */
const SOURCE_QUALITY = 86;

/** The upload media type. `adminAsset_upload` accepts PNG, JPEG or WebP. */
export const SOURCE_MEDIA_TYPE = 'image/jpeg';

/** The band a generated source is expected to land in. Asserted, not assumed. */
const MIN_SOURCE_BYTES = 150_000;
const MAX_SOURCE_BYTES = 3_000_000;

/** Linen ground, in linear 0..1 RGB. */
const GROUND = Object.freeze({ r: 0.898, g: 0.874, b: 0.827 });

/** How strongly the weave modulates the ground. */
const WEAVE_DEPTH = 0.055;

/** Threads per image edge. 160 gives a visible tooth at 1600 px and a plausible one at 800. */
const WEAVE_THREADS = 160;

/** Fibre noise. Small: the weave is the texture, the noise only breaks its regularity. */
const FIBRE_AMPLITUDE = 0.028;

/**
 * A cheap deterministic PRNG (xorshift32).
 *
 * Not cryptographic and not required to be. The only properties that matter are
 * repeatability and a flat enough distribution that the fibre term does not band.
 */
function makeRandom(seed) {
  let state = (seed + 1) * 0x9e37_79b1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffff_ffff;
  };
}

/** HSL to RGB in 0..1, so a hue step is a thread colour rather than a channel tweak. */
function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((((hue % 360) + 360) % 360) / 60) % 6;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return { r: r + match, g: g + match, b: b + match };
}

/**
 * The two thread colours for one image.
 *
 * The product hue anchors the family so a product's twenty images read as one
 * product, and the position rotates within a bounded arc so two neighbours in the
 * same gallery are still told apart. A full 360° spread per position would make
 * image 3 and image 4 of the same product look like different products.
 */
function threadPalette(productHue, position) {
  // 3° per position: twenty images span 57°, which shifts the thread visibly
  // without walking out of the family. The tally dots, not the hue, are the cue
  // a reviewer reads when they need the exact position.
  const hue = productHue + position * 3;
  return {
    primary: hslToRgb(hue, 0.52, 0.38),
    accent: hslToRgb(hue + 150, 0.44, 0.46),
  };
}

/** Smooth 0→1 across a one-pixel-ish band, so a stitch edge is not a staircase. */
function coverage(distance, radius, softness) {
  const t = (radius - distance) / softness;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * The rosette: `petals` lobes of a polar rose, worked as a thread of finite width.
 *
 * A rose curve `r = cos(k·θ)` gives the lobes; the coverage of a point is how
 * close it sits to that curve, which is what makes the result look like a laid
 * thread rather than a filled shape.
 */
function rosetteCoverage(u, v, petals) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const radius = Math.hypot(dx, dy);
  if (radius > 0.34 || radius < 0.02) {
    return 0;
  }
  const theta = Math.atan2(dy, dx);
  const lobe = 0.3 * Math.abs(Math.cos(petals * theta));
  return coverage(Math.abs(radius - lobe), 0.012, 0.01);
}

/** The centre knot, so the rosette has something to radiate from. */
function knotCoverage(u, v) {
  return coverage(Math.hypot(u - 0.5, v - 0.5), 0.028, 0.012);
}

/**
 * The position tally: `count` stitch dots in a row below the rosette.
 *
 * This is the part a reviewer actually reads when they check that the gallery is
 * in the order the Admin saved. The row is centred and its spacing shrinks with
 * the count, so twenty dots occupy the same band as three.
 */
function tallyCoverage(u, v, count) {
  const centreY = 0.87;
  const span = 0.62;
  const step = span / Math.max(count, 1);
  const dotRadius = Math.min(0.016, step * 0.3);
  const start = 0.5 - span / 2 + step / 2;
  for (let index = 0; index < count; index += 1) {
    const cx = start + index * step;
    if (Math.abs(u - cx) > step) {
      continue;
    }
    const hit = coverage(Math.hypot(u - cx, v - centreY), dotRadius, dotRadius * 0.5);
    if (hit > 0) {
      return hit;
    }
  }
  return 0;
}

/** Blends a thread colour over the ground by its coverage. */
function blend(base, thread, amount) {
  return {
    r: base.r + (thread.r - base.r) * amount,
    g: base.g + (thread.g - base.g) * amount,
    b: base.b + (thread.b - base.b) * amount,
  };
}

/**
 * Renders one image into a raw RGB buffer.
 *
 * `petals` and the hue rotation both come from `position`, so the two
 * distinguishing cues never disagree.
 */
function renderField({ edgePx, productHue, position }) {
  const channels = 3;
  const buffer = Buffer.allocUnsafe(edgePx * edgePx * channels);
  const random = makeRandom(productHue * 131 + position);
  const { primary, accent } = threadPalette(productHue, position);
  const petals = 5 + (position % 7);
  const tally = position + 1;
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(255 * value)));

  for (let y = 0; y < edgePx; y += 1) {
    const v = y / edgePx;
    for (let x = 0; x < edgePx; x += 1) {
      const u = x / edgePx;
      const offset = (y * edgePx + x) * channels;

      // The weave: warp and weft alternate which one sits on top, which is what
      // makes linen read as fabric rather than as a checkerboard.
      const warp = Math.sin(u * WEAVE_THREADS * Math.PI);
      const weft = Math.sin(v * WEAVE_THREADS * Math.PI);
      const over = Math.floor(u * WEAVE_THREADS) % 2 === Math.floor(v * WEAVE_THREADS) % 2;
      const weave = (over ? warp : weft) * WEAVE_DEPTH;
      const fibre = (random() - 0.5) * FIBRE_AMPLITUDE;
      // A soft vignette, as a lens gives.
      const vignette = 1 - 0.16 * Math.hypot(u - 0.5, v - 0.5);

      let colour = {
        r: (GROUND.r + weave + fibre) * vignette,
        g: (GROUND.g + weave + fibre) * vignette,
        b: (GROUND.b + weave + fibre) * vignette,
      };

      const rosette = rosetteCoverage(u, v, petals);
      if (rosette > 0) {
        colour = blend(colour, primary, rosette);
      }
      const knot = knotCoverage(u, v);
      if (knot > 0) {
        colour = blend(colour, accent, knot);
      }
      const dots = tallyCoverage(u, v, tally);
      if (dots > 0) {
        colour = blend(colour, accent, dots);
      }

      buffer[offset] = clamp(colour.r);
      buffer[offset + 1] = clamp(colour.g);
      buffer[offset + 2] = clamp(colour.b);
    }
  }
  return buffer;
}

/**
 * Encodes one upload-ready source image.
 *
 * @param {{ sharp: unknown, productHue: number, position: number, edgePx?: number }} params
 * @returns {Promise<{ body: Buffer, mediaType: string, widthPx: number, heightPx: number }>}
 */
export async function generateSourceImage({
  sharp,
  productHue,
  position,
  edgePx = SOURCE_EDGE_PX,
}) {
  const raw = renderField({ edgePx, productHue, position });
  const body = await sharp(raw, { raw: { width: edgePx, height: edgePx, channels: 3 } })
    .jpeg({ quality: SOURCE_QUALITY, mozjpeg: false })
    .toBuffer();

  // The band is asserted rather than hoped for: a generator change that
  // collapsed the texture would otherwise quietly seed a catalog of images
  // weighing a few kilobytes, and every later payload observation would be
  // measuring the generator instead of the application.
  if (body.byteLength < MIN_SOURCE_BYTES || body.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(
      `APP12-G03 source image (hue ${String(productHue)}, position ${String(position)}) encoded to ` +
        `${String(body.byteLength)} bytes, outside the expected ` +
        `${String(MIN_SOURCE_BYTES)}..${String(MAX_SOURCE_BYTES)} band.`,
    );
  }

  return { body, mediaType: SOURCE_MEDIA_TYPE, widthPx: edgePx, heightPx: edgePx };
}
