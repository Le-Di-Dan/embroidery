/**
 * `APP12-V02-C2` §9/§10 — the real image files the upload journeys send.
 *
 * These are written to disk because the journey drives the **native file
 * chooser**: Playwright hands the browser a path, and the browser reads and
 * posts the bytes exactly as an operator's browser would. Nothing here is a
 * fixture row, a stubbed response or a zero-byte stand-in — the whole point of
 * the correction is that real bytes survive the chain, and a file with no
 * pixels would prove none of it.
 *
 * ## The six
 *
 * Two PNG, two JPEG, two WebP, which is §10's stability sequence. Their sizes
 * are chosen rather than arbitrary:
 *
 * - a small image, the ordinary case;
 * - one near **900 KiB**, §12's first gateway probe;
 * - one over **4 MiB**, §12's second — the size H04 found a disposable edge
 *   rejecting around 1 MiB. It is well under the application's 10 MiB ceiling,
 *   so a refusal can only come from the edge, which is exactly what it probes.
 *
 * Size is reached through pixel count and encoder quality, never by padding:
 * a file inflated with trailing bytes is not the image its header claims, and
 * inspection would be right to refuse it.
 *
 * Content is a seeded structure-plus-noise field, following
 * `h05-media-generator`. Deterministic, so a re-run posts identical bytes and a
 * comparison between two runs measures the application; noisy, so the encoders
 * cannot collapse it to a few hundred bytes and the size targets are real.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Enough noise that a lossy encoder cannot discard the size target. */
const NOISE_AMPLITUDE = 0.55;

/**
 * The six sources. `edgePx` and `quality` together set the encoded size; the
 * assertions in `generateV02C2UploadSources` hold them to the stated band.
 */
export const V02_C2_UPLOAD_SOURCES = Object.freeze([
  { name: 'c2-small-a.png', format: 'png', edgePx: 240, minBytes: 20_000 },
  { name: 'c2-medium-a.jpeg', format: 'jpeg', edgePx: 900, quality: 88, minBytes: 200_000 },
  { name: 'c2-medium-b.webp', format: 'webp', edgePx: 700, quality: 90, minBytes: 120_000 },
  // ~900 KiB — §12's first gateway probe.
  { name: 'c2-gateway-900k.jpeg', format: 'jpeg', edgePx: 1_250, quality: 92, minBytes: 850_000 },
  // > 4 MiB — §12's second gateway probe, the size H04 found a disposable edge
  // refusing near 1 MiB. PNG is lossless, so the size follows the pixel count
  // and no encoder decision can quietly talk it back under the threshold.
  { name: 'c2-gateway-4m.png', format: 'png', edgePx: 1_240, minBytes: 4_194_304 },
  { name: 'c2-small-b.webp', format: 'webp', edgePx: 384, quality: 85, minBytes: 40_000 },
]);

/**
 * The application's own raster ceiling (`ASSET_UPLOAD_TOO_LARGE`, 10 MiB).
 *
 * Asserted against every generated source so the suite cannot accidentally
 * probe the edge with a file the *application* is right to refuse — that would
 * read as a gateway defect while being correct behaviour.
 */
const APPLICATION_CEILING_BYTES = 10 * 1024 * 1024;

/**
 * A deterministic RGB field.
 *
 * The PRNG is a cheap xorshift, not cryptographic and not required to be: the
 * only properties that matter are repeatability and enough amplitude that the
 * encoders keep the bytes.
 */
function rawField(edgePx, seed) {
  const channels = 3;
  const buffer = Buffer.allocUnsafe(edgePx * edgePx * channels);
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

function encode(sharp, spec, raw) {
  const pipeline = sharp(raw, { raw: { width: spec.edgePx, height: spec.edgePx, channels: 3 } });
  if (spec.format === 'png') {
    // Maximum compression, so the size a PNG reaches is the image's real
    // entropy rather than an encoder left lazy. A padded file would probe the
    // edge with bytes the image does not actually contain.
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }
  if (spec.format === 'jpeg') {
    return pipeline.jpeg({ quality: spec.quality }).toBuffer();
  }
  return pipeline.webp({ quality: spec.quality }).toBuffer();
}

/**
 * Writes the six sources and returns their manifest.
 *
 * @param {{ sharp: unknown, outDir: string, log?: (msg: string) => void }} params
 * @returns {Promise<ReadonlyArray<{ name: string, path: string, format: string,
 *   byteSize: number, widthPx: number, heightPx: number, checksum: string }>>}
 */
export async function generateV02C2UploadSources({ sharp, outDir, log = () => {} }) {
  mkdirSync(outDir, { recursive: true });
  const manifest = [];

  for (const [seed, spec] of V02_C2_UPLOAD_SOURCES.entries()) {
    const body = await encode(sharp, spec, rawField(spec.edgePx, seed));
    if (body.byteLength < spec.minBytes) {
      // A source that came out smaller than its band no longer probes what it
      // was written to probe — a 4 MiB gateway test that posts 200 KiB passes
      // while proving nothing. Failing here is the only way that stays visible.
      throw new Error(
        `${spec.name} encoded to ${String(body.byteLength)} bytes, ` +
          `below its ${String(spec.minBytes)}-byte floor.`,
      );
    }
    if (body.byteLength > APPLICATION_CEILING_BYTES) {
      throw new Error(
        `${spec.name} encoded to ${String(body.byteLength)} bytes, above the application's ` +
          `${String(APPLICATION_CEILING_BYTES)}-byte ceiling — it would be refused correctly ` +
          'and would read as an edge defect.',
      );
    }
    const path = join(outDir, spec.name);
    writeFileSync(path, body);
    manifest.push({
      name: spec.name,
      path,
      format: spec.format,
      byteSize: body.byteLength,
      widthPx: spec.edgePx,
      heightPx: spec.edgePx,
      checksum: `sha256:${createHash('sha256').update(body).digest('hex')}`,
    });
    log(
      `source ${spec.name} — ${String(Math.round(body.byteLength / 1024))} KiB, ` +
        `${String(spec.edgePx)}×${String(spec.edgePx)}`,
    );
  }

  return Object.freeze(manifest);
}
