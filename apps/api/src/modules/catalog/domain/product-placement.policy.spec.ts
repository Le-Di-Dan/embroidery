/**
 * The placement policy against its authorities (`APP3-B01`).
 *
 * The code-pattern case is the one that matters. `product-placement.policy.ts`
 * writes the expression as a literal because a **domain** module must not import
 * the ORM schema namespace, so nothing but this file holds the two declarations
 * together — and a drift between them would be invisible until a code the API
 * accepted arrived at the database as a bare 23514.
 */
import { schema } from '@embroidery/database';

import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  PLACEMENT_CODE,
  PLACEMENT_CODE_MAX_LENGTH,
  PLACEMENT_ORDER,
  REJECTED_SIDE_BACKGROUND_MEDIA_TYPE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
  SIDE_BACKGROUND_SOURCE_MEDIA_TYPES,
} from './product-placement.policy';

describe('placement code', () => {
  it('is the exact expression the schema CHECK enforces', () => {
    expect(PLACEMENT_CODE).toBe(schema.PLACEMENT_CODE_PATTERN);
  });

  it('accepts a stable machine identity and refuses display copy', () => {
    const pattern = new RegExp(PLACEMENT_CODE);
    for (const good of ['front', 'back-2', 'chest_left', 'a', '0', 'a'.repeat(64)]) {
      expect(pattern.test(good)).toBe(true);
    }
    for (const bad of ['', 'Front', 'mặt-trước', '-front', '_front', 'front ', 'a'.repeat(65)]) {
      expect(pattern.test(bad)).toBe(false);
    }
  });

  it('bounds the code at the length the pattern admits', () => {
    expect(PLACEMENT_CODE_MAX_LENGTH).toBe(64);
    expect(new RegExp(PLACEMENT_CODE).test('a'.repeat(PLACEMENT_CODE_MAX_LENGTH))).toBe(true);
  });
});

describe('side background lane', () => {
  it('is the catalog-media lane (IMP-D044 PO-03)', () => {
    expect(SIDE_BACKGROUND_ASSET_KIND).toBe('CATALOG_MEDIA');
    // `PRODUCTION_SENSITIVE`, not `PUBLIC`: the classification describes the
    // stored *original*, which is never delivered. What a customer sees is a
    // derivative, and the lane is the same one the catalogue's own images use.
    expect(SIDE_BACKGROUND_ASSET_CLASSIFICATION).toBe('PRODUCTION_SENSITIVE');
    expect(SIDE_BACKGROUND_ASSET_STATUS).toBe('ACCEPTED');
  });

  it('accepts raster sources only and names SVG as the refused one', () => {
    expect([...SIDE_BACKGROUND_SOURCE_MEDIA_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(SIDE_BACKGROUND_SOURCE_MEDIA_TYPES).not.toContain(REJECTED_SIDE_BACKGROUND_MEDIA_TYPE);
    expect(REJECTED_SIDE_BACKGROUND_MEDIA_TYPE).toBe('image/svg+xml');
  });
});

describe('editor-safe derivative', () => {
  it('is NORMALIZED and never a catalogue or watermarked kind', () => {
    // IMP-D044 PO-01 authorised no new enum value; the catalogue kinds are
    // store marketing media and PREVIEW_WATERMARKED has the watermark baked in.
    expect(EDITOR_SAFE_DERIVATIVE_KIND).toBe('NORMALIZED');
    expect(EDITOR_SAFE_DERIVATIVE_STATE).toBe('READY');
    for (const rejected of ['THUMBNAIL', 'CATALOG_PREVIEW', 'PREVIEW_WATERMARKED', 'MOCKUP']) {
      expect(EDITOR_SAFE_DERIVATIVE_KIND).not.toBe(rejected);
    }
  });

  it('names a kind the schema actually admits', () => {
    expect(schema.ASSET_DERIVATIVE_KINDS).toContain(EDITOR_SAFE_DERIVATIVE_KIND);
    expect(schema.ASSET_DERIVATIVE_STATES).toContain(EDITOR_SAFE_DERIVATIVE_STATE);
  });
});

describe('ordering', () => {
  it('is total: display order, then stable code, then id', () => {
    // Without the id the order is not total, and a Studio that auto-selects
    // "the first side" could select a different one between two page loads.
    expect([...PLACEMENT_ORDER]).toEqual(['display_order', 'code', 'id']);
  });
});
