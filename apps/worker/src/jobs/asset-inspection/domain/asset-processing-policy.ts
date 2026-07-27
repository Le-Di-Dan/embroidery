/**
 * The locked asset-processing policy, version 1 (APP2-W01 §6, §7).
 *
 * One frozen object, owned by the worker. Not client-selectable, not an
 * environment-variable family and not an operator policy row: these values
 * decide what an image *is allowed to be* before the system will store a
 * derivative of it, so a deployment that could change them could also change
 * what "safe" means without an audit trail. `worker.runtime` (APP2-I02 §12)
 * stays the only versioned operator policy; this one travels with the code that
 * enforces it, and its version is written into every inspection record.
 *
 * The two outputs are private, unwatermarked and generated from a
 * `CATALOG_MEDIA` original: store-owned marketing media, which is why they map
 * to `THUMBNAIL` and `CATALOG_PREVIEW` (APP2-DB01) and never to
 * `PREVIEW_WATERMARKED`, `NORMALIZED` or `MOCKUP`.
 */
import type { AssetDerivativeKind } from '@embroidery/database';

export const ASSET_PROCESSING_POLICY_VERSION = 1;

/** The decoded formats Sharp may report, keyed by the persisted source MIME. */
export const SOURCE_FORMAT_BY_MEDIA_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
} as const satisfies Readonly<Record<string, string>>;

export type ProcessableMediaType = keyof typeof SOURCE_FORMAT_BY_MEDIA_TYPE;
export type ProcessableFormat = (typeof SOURCE_FORMAT_BY_MEDIA_TYPE)[ProcessableMediaType];

export const PROCESSABLE_MEDIA_TYPES = Object.keys(
  SOURCE_FORMAT_BY_MEDIA_TYPE,
) as readonly ProcessableMediaType[];

export const PROCESSABLE_FORMATS = Object.values(
  SOURCE_FORMAT_BY_MEDIA_TYPE,
) as readonly ProcessableFormat[];

export function isProcessableMediaType(value: string): value is ProcessableMediaType {
  return (PROCESSABLE_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * Sharp's safety options.
 *
 * `failOn: 'warning'` is the strictest setting: a truncated or subtly malformed
 * file that libvips would otherwise decode "best effort" becomes an error, so a
 * damaged upload is rejected rather than silently turned into a half-grey
 * derivative nobody notices until a customer sees it.
 *
 * `unlimited: false` keeps libvips' own memory ceiling in place, `animated:
 * false` decodes only the first frame so a multi-page container cannot smuggle
 * extra work in, and `sequentialRead: true` lets libvips stream rather than
 * seek — the mode that makes a stream-fed pipeline bounded instead of buffered.
 */
export const ASSET_PROCESSING_POLICY_V1 = Object.freeze({
  policyVersion: ASSET_PROCESSING_POLICY_VERSION,
  sourceMediaTypes: PROCESSABLE_MEDIA_TYPES,
  decodedFormats: PROCESSABLE_FORMATS,
  /** Animated and multi-page inputs are rejected, never flattened. */
  allowAnimated: false,
  maxOrientedWidth: 12_000,
  maxOrientedHeight: 12_000,
  maxOrientedPixels: 40_000_000,
  maxChannels: 4,
  maxPages: 1,
  sharp: Object.freeze({
    failOn: 'warning',
    unlimited: false,
    sequentialRead: true,
    animated: false,
  }),
} as const);

export type WebpOutputPolicy = {
  readonly quality: number;
  readonly alphaQuality: number;
  readonly effort: number;
  readonly smartSubsample: boolean;
};

export interface DerivativeOutputPolicy {
  readonly kind: Extract<AssetDerivativeKind, 'THUMBNAIL' | 'CATALOG_PREVIEW'>;
  readonly mediaType: 'image/webp';
  /** Bounding box; `fit: inside` preserves aspect ratio and never crops. */
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly fit: 'inside';
  /** A small original stays its own size — upscaling invents detail. */
  readonly withoutEnlargement: true;
  readonly isWatermarked: false;
  readonly webp: WebpOutputPolicy;
}

const WEBP_OUTPUT: WebpOutputPolicy = Object.freeze({
  quality: 82,
  // Full-quality alpha: the colour channels can afford lossy compression, but a
  // degraded alpha channel shows up as a fringe on every transparent edge.
  alphaQuality: 100,
  effort: 4,
  smartSubsample: true,
});

export const THUMBNAIL_OUTPUT_POLICY: DerivativeOutputPolicy = Object.freeze({
  kind: 'THUMBNAIL',
  mediaType: 'image/webp',
  maxWidth: 480,
  maxHeight: 480,
  fit: 'inside',
  withoutEnlargement: true,
  isWatermarked: false,
  webp: WEBP_OUTPUT,
});

export const CATALOG_PREVIEW_OUTPUT_POLICY: DerivativeOutputPolicy = Object.freeze({
  kind: 'CATALOG_PREVIEW',
  mediaType: 'image/webp',
  maxWidth: 1_920,
  maxHeight: 1_920,
  fit: 'inside',
  withoutEnlargement: true,
  isWatermarked: false,
  webp: WEBP_OUTPUT,
});

/**
 * The two outputs, in generation order.
 *
 * Ordered and generated sequentially on purpose: two concurrent libvips
 * pipelines over the same original double peak native memory for no wall-clock
 * benefit worth that cost on a worker sized for many small jobs.
 */
export const DERIVATIVE_OUTPUT_POLICIES: readonly DerivativeOutputPolicy[] = Object.freeze([
  THUMBNAIL_OUTPUT_POLICY,
  CATALOG_PREVIEW_OUTPUT_POLICY,
]);

export const DERIVATIVE_KINDS = Object.freeze(
  DERIVATIVE_OUTPUT_POLICIES.map((policy) => policy.kind),
);

export type CatalogDerivativeKind = DerivativeOutputPolicy['kind'];
