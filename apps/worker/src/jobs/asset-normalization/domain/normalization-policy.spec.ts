/**
 * The frozen normalization policy (`APP3-W01A`; IMP-D044 PO-01/PO-02/PO-08).
 *
 * These assertions exist because every value here is a security or product
 * decision wearing the clothes of a configuration constant. A watermarked
 * output, a fourth profile, a looser pixel budget or a second derivative kind
 * would each compile, pass every functional test, and change what "editor-safe"
 * means.
 *
 * The limits are checked at the boundary and one past it, because an off-by-one
 * in a ceiling is the defect a "roughly 4096" test cannot see.
 */
import { ASSET_PROCESSING_POLICY_V1 } from '../../asset-inspection/domain/asset-processing-policy';
import {
  NORMALIZATION_LIMITS,
  NORMALIZATION_POLICY_VERSION,
  NORMALIZATION_PROFILES,
  NORMALIZATION_SOURCE_MEDIA_TYPES,
  NORMALIZED_OUTPUT_POLICY,
  TEMPLATE_SVG_MEDIA_TYPE,
  isNormalizationSourceMediaType,
} from './normalization-policy';

describe('the profiles', () => {
  it('are exactly the three IMP-D044 names', () => {
    expect([...NORMALIZATION_PROFILES]).toEqual([
      'SIDE_BACKGROUND',
      'TEMPLATE_ASSET',
      'SESSION_UPLOAD',
    ]);
  });

  it('are a transient vocabulary, versioned with the policy', () => {
    expect(NORMALIZATION_POLICY_VERSION).toBe(1);
  });
});

describe('the source allowlist', () => {
  it('is raster only, for every profile', () => {
    expect([...NORMALIZATION_SOURCE_MEDIA_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('excludes SVG, which W01A never decodes', () => {
    expect(isNormalizationSourceMediaType(TEMPLATE_SVG_MEDIA_TYPE)).toBe(false);
    expect(TEMPLATE_SVG_MEDIA_TYPE).toBe('image/svg+xml');
  });

  it('excludes anything the accepted decoder policy does not already admit', () => {
    for (const mediaType of NORMALIZATION_SOURCE_MEDIA_TYPES) {
      expect(ASSET_PROCESSING_POLICY_V1.sourceMediaTypes).toContain(mediaType);
    }
    for (const rejected of ['image/gif', 'image/avif', 'application/pdf', 'image/tiff', '']) {
      expect(isNormalizationSourceMediaType(rejected)).toBe(false);
    }
  });
});

describe('the limits', () => {
  it('are the exact IMP-D044 PO-08 raster values', () => {
    expect(NORMALIZATION_LIMITS.maxSourceBytes).toBe(10 * 1024 * 1024);
    expect(NORMALIZATION_LIMITS.maxDecodedWidth).toBe(4096);
    expect(NORMALIZATION_LIMITS.maxDecodedHeight).toBe(4096);
    expect(NORMALIZATION_LIMITS.maxDecodedPixels).toBe(16_777_216);
  });

  it('are tighter than the catalogue decoder bounds, so the Studio budget wins', () => {
    // The looser policy still guards the decoder; the lower ceiling decides.
    expect(NORMALIZATION_LIMITS.maxDecodedWidth).toBeLessThan(
      ASSET_PROCESSING_POLICY_V1.maxOrientedWidth,
    );
    expect(NORMALIZATION_LIMITS.maxDecodedPixels).toBeLessThan(
      ASSET_PROCESSING_POLICY_V1.maxOrientedPixels,
    );
  });

  it('admit the boundary and refuse one past it', () => {
    const { maxSourceBytes, maxDecodedWidth, maxDecodedPixels } = NORMALIZATION_LIMITS;
    expect(maxSourceBytes <= NORMALIZATION_LIMITS.maxSourceBytes).toBe(true);
    expect(maxSourceBytes + 1 <= NORMALIZATION_LIMITS.maxSourceBytes).toBe(false);
    expect(maxDecodedWidth <= NORMALIZATION_LIMITS.maxDecodedWidth).toBe(true);
    expect(maxDecodedWidth + 1 <= NORMALIZATION_LIMITS.maxDecodedWidth).toBe(false);
    // 4096 × 4096 is exactly the decoded-pixel budget: the two ceilings meet.
    expect(maxDecodedWidth * NORMALIZATION_LIMITS.maxDecodedHeight).toBe(maxDecodedPixels);
  });
});

describe('the output', () => {
  it('is the sole editor-safe kind and never an APP2 or watermarked one', () => {
    expect(NORMALIZED_OUTPUT_POLICY.kind).toBe('NORMALIZED');
    expect(NORMALIZED_OUTPUT_POLICY.isWatermarked).toBe(false);
    for (const rejected of ['THUMBNAIL', 'CATALOG_PREVIEW', 'PREVIEW_WATERMARKED', 'MOCKUP']) {
      expect(NORMALIZED_OUTPUT_POLICY.kind).not.toBe(rejected);
    }
  });

  it('is deterministic WebP at the accepted encoder settings', () => {
    expect(NORMALIZED_OUTPUT_POLICY.mediaType).toBe('image/webp');
    expect(NORMALIZED_OUTPUT_POLICY.webp).toEqual({
      quality: 82,
      alphaQuality: 100,
      effort: 4,
      smartSubsample: true,
    });
  });

  it('never enlarges, and its resize box can never bind', () => {
    // An over-limit source is rejected before a pipeline exists (PO-08 forbids
    // resizing one into compliance), so the box equals the ceiling and exists
    // only as defence in depth.
    expect(NORMALIZED_OUTPUT_POLICY.withoutEnlargement).toBe(true);
    expect(NORMALIZED_OUTPUT_POLICY.fit).toBe('inside');
    expect(NORMALIZED_OUTPUT_POLICY.maxWidth).toBe(NORMALIZATION_LIMITS.maxDecodedWidth);
    expect(NORMALIZED_OUTPUT_POLICY.maxHeight).toBe(NORMALIZATION_LIMITS.maxDecodedHeight);
  });

  it('is frozen, so no deployment can edit what editor-safe means', () => {
    expect(Object.isFrozen(NORMALIZED_OUTPUT_POLICY)).toBe(true);
    expect(Object.isFrozen(NORMALIZATION_LIMITS)).toBe(true);
  });
});
