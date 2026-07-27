/**
 * The only file that imports Sharp (APP2-W01 §6, §7, §13).
 *
 * Everything above this line works with plain data, so the policy, the
 * lifecycle and the persistence rules are all testable without a native
 * module — and swapping the processor would be one file, not a rewrite.
 *
 * Two things are deliberate here. Metadata is read in its own pass, so a
 * rejection is decided *before* a single derivative byte is produced; and the
 * pipeline is constructed fresh for every output, because a Sharp instance is
 * bound to one input stream and reusing one would silently re-encode the first
 * output instead of re-reading the original.
 */
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import type { OutputInfo as SharpOutputInfo, Sharp, SharpOptions } from 'sharp';

import type { DerivativeOutputPolicy } from '../../domain/asset-processing-policy';
import { ASSET_PROCESSING_POLICY_V1 } from '../../domain/asset-processing-policy';

/** What the shipped native module reports; asserted against the pinned value. */
export const INSTALLED_SHARP_VERSION = sharp.versions.sharp;

/**
 * The locked safety options, applied identically to the probe and to both
 * output pipelines.
 *
 * `limitInputPixels` restates the policy ceiling inside libvips as a second
 * line of defence. The explicit metadata check rejects an oversized image first
 * and with a precise code, so this bound should never be the thing that fires —
 * but if a future edit ever removed that check, libvips would still refuse to
 * decode rather than allocate for a 400-megapixel image.
 */
export function sharpOptions(): SharpOptions {
  return {
    failOn: ASSET_PROCESSING_POLICY_V1.sharp.failOn,
    unlimited: ASSET_PROCESSING_POLICY_V1.sharp.unlimited,
    sequentialRead: ASSET_PROCESSING_POLICY_V1.sharp.sequentialRead,
    animated: ASSET_PROCESSING_POLICY_V1.sharp.animated,
    limitInputPixels: ASSET_PROCESSING_POLICY_V1.maxOrientedPixels,
  };
}

/**
 * The probe's options.
 *
 * Identical to the pipeline's except for `limitInputPixels`, which is disabled
 * here — and that difference is deliberate. `metadata()` parses the header and
 * decodes nothing, so no allocation depends on the declared size; but with the
 * limit in place libvips rejects an oversized image *inside* `metadata()`, and
 * the only thing this code could then report is "could not decode". An
 * 80-megapixel upload would be recorded as `DECODE_FAILED` when the truth is
 * `PIXEL_LIMIT_EXCEEDED`. Reading the header without a limit is what lets the
 * explicit policy check name the real reason; the generation pipelines, which
 * do allocate, keep the limit.
 */
export function probeOptions(): SharpOptions {
  return { ...sharpOptions(), limitInputPixels: false };
}

export interface SourceMetadata {
  readonly format: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
  /** Post-EXIF dimensions, as libvips itself computes them. */
  readonly orientedWidth: number | undefined;
  readonly orientedHeight: number | undefined;
  readonly channels: number | undefined;
  readonly orientation: number | undefined;
  /** Present (and > 1) only for a genuinely multi-page/animated container. */
  readonly pages: number | undefined;
  readonly hasAlpha: boolean;
}

/**
 * Reads header metadata from a source stream.
 *
 * The stream is destroyed as soon as the answer is known — for a large original
 * that means the read is abandoned after a few kilobytes rather than pulled to
 * the end for information already in hand.
 */
export async function readSourceMetadata(body: Readable): Promise<SourceMetadata> {
  const probe = sharp(probeOptions());
  // Requested before the first byte is written: `metadata()` must be listening
  // when the header arrives, and an unobserved `error` on either side of the
  // pipe would otherwise reach the process as an uncaught exception.
  const pending = probe.metadata();
  probe.on('error', () => undefined);
  body.on('error', (error: Error) => {
    probe.destroy(error);
  });
  body.pipe(probe);

  try {
    const metadata = await pending;
    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      orientedWidth: metadata.autoOrient?.width,
      orientedHeight: metadata.autoOrient?.height,
      channels: metadata.channels,
      orientation: metadata.orientation,
      pages: metadata.pages,
      hasAlpha: metadata.hasAlpha === true,
    };
  } finally {
    body.destroy();
    probe.destroy();
  }
}

/**
 * The output pipeline for one derivative policy.
 *
 * Order matters and is the policy in code:
 *
 *   autoOrient  — apply the EXIF rotation before measuring or resizing, so the
 *                 bounding box applies to what a viewer will actually see;
 *   resize      — `fit: inside` + `withoutEnlargement` fits within the box,
 *                 preserves the aspect ratio, never crops and never upscales;
 *   toColourspace — normalise to sRGB so a CMYK or Display-P3 original does not
 *                 render with shifted colour in a browser;
 *   webp        — the exact encoder settings.
 *
 * No `withMetadata`, `keepMetadata`, `keepExif` or `keepIccProfile` call
 * appears anywhere: Sharp strips EXIF, XMP, IPTC and comments by default, and
 * the way to guarantee they are gone is to never ask for them back.
 */
export function buildDerivativePipeline(policy: DerivativeOutputPolicy): Sharp {
  return sharp(sharpOptions())
    .autoOrient()
    .resize({
      width: policy.maxWidth,
      height: policy.maxHeight,
      fit: policy.fit,
      withoutEnlargement: policy.withoutEnlargement,
    })
    .toColourspace('srgb')
    .webp({
      quality: policy.webp.quality,
      alphaQuality: policy.webp.alphaQuality,
      effort: policy.webp.effort,
      smartSubsample: policy.webp.smartSubsample,
    });
}

export interface OutputInfo {
  readonly width: number;
  readonly height: number;
  readonly size: number;
}

/** Subscribes to the pipeline's own report of what it produced. */
export function captureOutputInfo(pipeline: Sharp): { read(): OutputInfo | undefined } {
  let info: OutputInfo | undefined;
  pipeline.on('info', (event: SharpOutputInfo) => {
    info = { width: event.width, height: event.height, size: event.size };
  });
  return {
    read: (): OutputInfo | undefined => info,
  };
}
