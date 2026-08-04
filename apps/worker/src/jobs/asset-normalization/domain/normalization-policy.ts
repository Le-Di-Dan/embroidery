/**
 * The locked editor-safe normalization policy, version 1 (`APP3-W01A`).
 *
 * One frozen object owned by the worker, exactly as `ASSET_PROCESSING_POLICY_V1`
 * is: not client-selectable, not an environment-variable family and not an
 * operator policy row. These values decide what a Studio background *is allowed
 * to be*, so a deployment that could change them could change what "editor-safe"
 * means without an audit trail. The version travels with the code that enforces
 * it and is carried in the event payload, so a producer and a consumer can never
 * silently disagree about which rules ran.
 *
 * The source rules are **reused, not restated**: `ASSET_PROCESSING_POLICY_V1`
 * already fixes the decoder options, the animated/multi-page refusal and the
 * channel ceiling, and a second copy is how two pipelines start disagreeing
 * about what a safe decode is. What is new here is the APP3 half — the three
 * profiles (IMP-D044 PO-02), the tighter upload limits (PO-08) and the output
 * policy for the one editor-safe kind (PO-01).
 */
import type { AssetDerivativeKind } from '@embroidery/database';

import {
  ASSET_PROCESSING_POLICY_V1,
  SOURCE_FORMAT_BY_MEDIA_TYPE,
  type ProcessableMediaType,
} from '../../asset-inspection/domain/asset-processing-policy';
import type { RasterEncodePolicy } from '../../asset-inspection/infrastructure/image/sharp-pipeline';

/** Carried in every event payload; a mismatch is a terminal payload rejection. */
export const NORMALIZATION_POLICY_VERSION = 1;

/**
 * The three transient processing profiles (IMP-D044 PO-02).
 *
 * Never a database enum and never a column: they are derived at claim time from
 * the association the event names, and `IMP-D046` PO-08 forbids persisting one
 * on `asset_derivatives`.
 */
export const NORMALIZATION_PROFILES = [
  'SIDE_BACKGROUND',
  'TEMPLATE_ASSET',
  'SESSION_UPLOAD',
] as const;

export type NormalizationProfile = (typeof NORMALIZATION_PROFILES)[number];

/**
 * The raster sources every profile accepts (IMP-D044 PO-03/PO-04/PO-05).
 *
 * The same three for all three profiles in `APP3-W01A`, because SVG — the only
 * type that differs between them — is not processed here at all. The list is a
 * subset of what APP2 already decodes, so no new decoder path exists.
 */
export const NORMALIZATION_SOURCE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly ProcessableMediaType[];

export type NormalizationSourceMediaType = (typeof NORMALIZATION_SOURCE_MEDIA_TYPES)[number];

export function isNormalizationSourceMediaType(
  value: string,
): value is NormalizationSourceMediaType {
  return (NORMALIZATION_SOURCE_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * The one media type `APP3-W01B` will own.
 *
 * Named here so the staged refusal can be exact rather than "anything else":
 * a Template SVG is *authorized* by IMP-D044 and merely unavailable, which is a
 * different answer from an unsupported type and must not be reported as one.
 */
export const TEMPLATE_SVG_MEDIA_TYPE = 'image/svg+xml' as const;

/**
 * The APP3 upload limits (IMP-D044 PO-08).
 *
 * Deliberately **tighter** than `ASSET_PROCESSING_POLICY_V1`'s catalogue bounds
 * (12,000 px / 40 megapixels): a catalogue photograph is display media, while an
 * editor background is decoded in a browser alongside a live design, so the
 * Studio budget is the one that governs. The looser policy still applies to the
 * decoder, so both ceilings hold and the lower one decides.
 */
export const NORMALIZATION_LIMITS = Object.freeze({
  maxSourceBytes: 10 * 1024 * 1024,
  maxDecodedWidth: 4096,
  maxDecodedHeight: 4096,
  maxDecodedPixels: 16_777_216,
});

/**
 * The editor-safe output (IMP-D044 PO-01, PO-07).
 *
 * WebP at the APP2 encoder settings, sRGB, orientation applied, metadata
 * stripped by omission — every one of those is the accepted convention rather
 * than a fresh choice, which is what makes the output deterministic across
 * deployments.
 *
 * The resize box is the ruled dimension ceiling and **can never bind**: anything
 * larger is rejected before a pipeline is built (PO-08 forbids resizing an
 * over-limit source into compliance). It is here as defence in depth, the same
 * role `limitInputPixels` plays inside libvips — if a future edit ever dropped
 * the explicit check, the encoder would still refuse to enlarge the canvas
 * rather than silently produce an out-of-budget background.
 */
export const NORMALIZED_OUTPUT_POLICY = Object.freeze({
  kind: 'NORMALIZED' as const satisfies AssetDerivativeKind,
  mediaType: 'image/webp' as const,
  maxWidth: NORMALIZATION_LIMITS.maxDecodedWidth,
  maxHeight: NORMALIZATION_LIMITS.maxDecodedHeight,
  fit: 'inside' as const,
  withoutEnlargement: true as const,
  isWatermarked: false as const,
  webp: Object.freeze({
    quality: 82,
    // Full-quality alpha, as APP2 fixed it: a degraded alpha channel shows up
    // as a fringe on every transparent edge, and a Studio background is
    // composited under the customer's own artwork.
    alphaQuality: 100,
    effort: 4,
    smartSubsample: true,
  }),
}) satisfies RasterEncodePolicy;

/** The decoded formats this policy admits, keyed by the persisted source MIME. */
export const NORMALIZATION_FORMAT_BY_MEDIA_TYPE = Object.freeze(
  Object.fromEntries(
    NORMALIZATION_SOURCE_MEDIA_TYPES.map((mediaType) => [
      mediaType,
      SOURCE_FORMAT_BY_MEDIA_TYPE[mediaType],
    ]),
  ),
) as Readonly<Record<NormalizationSourceMediaType, string>>;

/** The shared decoder options, so nothing here re-derives a safe decode. */
export const NORMALIZATION_SHARP_SOURCE_POLICY = ASSET_PROCESSING_POLICY_V1;
