import { ASSET_DERIVATIVE_KINDS } from '@embroidery/database/schema';

import {
  ASSET_PROCESSING_POLICY_V1,
  ASSET_PROCESSING_POLICY_VERSION,
  CATALOG_PREVIEW_OUTPUT_POLICY,
  DERIVATIVE_KINDS,
  DERIVATIVE_OUTPUT_POLICIES,
  SOURCE_FORMAT_BY_MEDIA_TYPE,
  THUMBNAIL_OUTPUT_POLICY,
  isProcessableMediaType,
} from './asset-processing-policy';

describe('ASSET_PROCESSING_POLICY_V1', () => {
  it('pins the locked source and decode limits', () => {
    // Written out as literals on purpose: a test that recomputed them from the
    // module would pass no matter what the module said.
    expect(ASSET_PROCESSING_POLICY_VERSION).toBe(1);
    expect(ASSET_PROCESSING_POLICY_V1.policyVersion).toBe(1);
    expect([...ASSET_PROCESSING_POLICY_V1.sourceMediaTypes]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
    expect([...ASSET_PROCESSING_POLICY_V1.decodedFormats]).toEqual(['png', 'jpeg', 'webp']);
    expect(ASSET_PROCESSING_POLICY_V1.allowAnimated).toBe(false);
    expect(ASSET_PROCESSING_POLICY_V1.maxOrientedWidth).toBe(12_000);
    expect(ASSET_PROCESSING_POLICY_V1.maxOrientedHeight).toBe(12_000);
    expect(ASSET_PROCESSING_POLICY_V1.maxOrientedPixels).toBe(40_000_000);
    expect(ASSET_PROCESSING_POLICY_V1.maxChannels).toBe(4);
    expect(ASSET_PROCESSING_POLICY_V1.maxPages).toBe(1);
  });

  it('pins the Sharp safety options', () => {
    expect(ASSET_PROCESSING_POLICY_V1.sharp).toEqual({
      failOn: 'warning',
      unlimited: false,
      sequentialRead: true,
      animated: false,
    });
  });

  it('is frozen, so it cannot be tuned at runtime', () => {
    expect(Object.isFrozen(ASSET_PROCESSING_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(ASSET_PROCESSING_POLICY_V1.sharp)).toBe(true);
  });

  it('maps each accepted MIME type to exactly one decoded format', () => {
    expect(SOURCE_FORMAT_BY_MEDIA_TYPE).toEqual({
      'image/png': 'png',
      'image/jpeg': 'jpeg',
      'image/webp': 'webp',
    });
  });

  it.each(['image/svg+xml', 'image/gif', 'image/avif', 'image/tiff', 'application/pdf'])(
    'does not accept %s',
    (mediaType) => {
      expect(isProcessableMediaType(mediaType)).toBe(false);
    },
  );
});

describe('derivative output policies', () => {
  it('produces exactly two outputs, in generation order', () => {
    expect(DERIVATIVE_OUTPUT_POLICIES).toHaveLength(2);
    expect([...DERIVATIVE_KINDS]).toEqual(['THUMBNAIL', 'CATALOG_PREVIEW']);
  });

  it('pins the THUMBNAIL policy', () => {
    expect(THUMBNAIL_OUTPUT_POLICY).toEqual({
      kind: 'THUMBNAIL',
      mediaType: 'image/webp',
      maxWidth: 480,
      maxHeight: 480,
      fit: 'inside',
      withoutEnlargement: true,
      isWatermarked: false,
      webp: { quality: 82, alphaQuality: 100, effort: 4, smartSubsample: true },
    });
  });

  it('pins the CATALOG_PREVIEW policy', () => {
    expect(CATALOG_PREVIEW_OUTPUT_POLICY).toEqual({
      kind: 'CATALOG_PREVIEW',
      mediaType: 'image/webp',
      maxWidth: 1_920,
      maxHeight: 1_920,
      fit: 'inside',
      withoutEnlargement: true,
      isWatermarked: false,
      webp: { quality: 82, alphaQuality: 100, effort: 4, smartSubsample: true },
    });
  });

  it('maps both outputs onto canonical, unwatermarked derivative kinds', () => {
    // The DB01 ruling: a catalog preview is store-owned marketing media, so it
    // is its own kind and carries no watermark. `CATALOG_PREVIEW` with
    // `is_watermarked = true` is refused by CST-126 in the database.
    for (const policy of DERIVATIVE_OUTPUT_POLICIES) {
      expect(ASSET_DERIVATIVE_KINDS).toContain(policy.kind);
      expect(policy.isWatermarked).toBe(false);
    }
  });

  it('uses none of the kinds reserved for the design/artwork pipeline', () => {
    const kinds = new Set<string>(DERIVATIVE_KINDS);

    expect(kinds.has('PREVIEW_WATERMARKED')).toBe(false);
    expect(kinds.has('NORMALIZED')).toBe(false);
    expect(kinds.has('MOCKUP')).toBe(false);
  });

  it('never crops or letterboxes', () => {
    for (const policy of DERIVATIVE_OUTPUT_POLICIES) {
      expect(policy.fit).toBe('inside');
      expect(policy.withoutEnlargement).toBe(true);
    }
  });
});
