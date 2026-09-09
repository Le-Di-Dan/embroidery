/**
 * @jest-environment node
 *
 * The Admin product-media selection model, and the one number it may not get
 * wrong.
 *
 * Node environment on purpose: the capacity parity check reads the committed
 * OpenAPI artifact off disk, which is the only way to prove that the frontend
 * constant and the contract agree. A jsdom document would add nothing and the
 * rest of this file is pure functions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_PRODUCT_MEDIA_ITEMS,
  isAtCapacity,
  remainingCapacity,
} from '../../src/features/products/model/product-media-capacity';
import {
  canMoveEarlier,
  canMoveLater,
  canRemoveAt,
  mediaStatusByAssetId,
  removeAt,
  selectionFromDetailMedia,
  setPrimary,
} from '../../src/features/products/model/product-media-selection';
import {
  assetThumbnailCaption,
  toAssetThumbnailState,
} from '../../src/shared/media/asset-thumbnail-state';
import { makeProductMedia } from '../support/product-fixture';
import { classifyMediaFailure } from '../../src/features/products/model/product-media-failure';
import { normalizeApiClientError } from '@embroidery/api-client';

import { makeApiClientError } from '../support/api-error';
import { ProductApiError } from '../../src/features/products/model/product-failure';

describe('capacity parity with the published contract', () => {
  /**
   * `MAX_PRODUCT_MEDIA_ITEMS` exists in the frontend only because `maxItems`
   * survives Orval generation as a JSDoc annotation and not as a runtime value.
   * That makes it the one business number this app restates, so it is pinned to
   * its source rather than trusted: a backend change to the cap fails here
   * instead of producing a screen that quietly lies about the limit.
   */
  it('matches ReplaceProductMediaBody.mediaAssetIds.maxItems exactly', () => {
    const artifact = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'contracts',
      'openapi',
      'openapi.generated.json',
    );
    const document = JSON.parse(readFileSync(artifact, 'utf8')) as {
      components: {
        schemas: Record<string, { properties?: Record<string, { maxItems?: number }> }>;
      };
    };
    const body = document.components.schemas['ReplaceProductMediaBody'];

    // A missing schema would make the assertion below vacuous.
    expect(body?.properties?.['mediaAssetIds']).toBeDefined();
    expect(body?.properties?.['mediaAssetIds']?.maxItems).toBe(MAX_PRODUCT_MEDIA_ITEMS);
  });

  it('reports what is left, and never a negative remainder', () => {
    expect(remainingCapacity(0)).toBe(MAX_PRODUCT_MEDIA_ITEMS);
    expect(remainingCapacity(8)).toBe(MAX_PRODUCT_MEDIA_ITEMS - 8);
    expect(remainingCapacity(MAX_PRODUCT_MEDIA_ITEMS)).toBe(0);
    // A product that somehow holds more than the cap must not offer capacity.
    expect(remainingCapacity(MAX_PRODUCT_MEDIA_ITEMS + 3)).toBe(0);
  });

  it('is at capacity only at the cap', () => {
    expect(isAtCapacity(MAX_PRODUCT_MEDIA_ITEMS - 1)).toBe(false);
    expect(isAtCapacity(MAX_PRODUCT_MEDIA_ITEMS)).toBe(true);
  });
});

describe('set-primary', () => {
  it('moves the chosen image to the front and preserves every other order', () => {
    expect(setPrimary(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('is a no-op on the image that is already primary', () => {
    const selection = ['a', 'b', 'c'];
    expect(setPrimary(selection, 0)).toEqual(selection);
  });

  it('is a no-op out of range rather than throwing on a stale click', () => {
    const selection = ['a', 'b'];
    expect(setPrimary(selection, 9)).toEqual(selection);
    expect(setPrimary(selection, -1)).toEqual(selection);
  });
});

describe('the primary anchor (APP12-M01.D1 §H.1 — Option B)', () => {
  const four = ['a', 'b', 'c', 'd'];

  it('offers neither arrow on the primary', () => {
    expect(canMoveEarlier(four, 0)).toBe(false);
    expect(canMoveLater(four, 0)).toBe(false);
  });

  it('refuses to move position 2 into the primary slot', () => {
    // Allowing it would make one arrow press silently rewrite the product's
    // canonical thumbnail and its og:image.
    expect(canMoveEarlier(four, 1)).toBe(false);
    expect(canMoveLater(four, 1)).toBe(true);
  });

  it('still applies the universal end rules to the gallery', () => {
    expect(canMoveEarlier(four, 2)).toBe(true);
    expect(canMoveLater(four, 3)).toBe(false);
  });

  it('leaves a single image with nowhere to go', () => {
    expect(canMoveEarlier(['a'], 0)).toBe(false);
    expect(canMoveLater(['a'], 0)).toBe(false);
  });
});

describe('removal', () => {
  it('removes by position, so two identical ids could not both go', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('lets a draft be emptied', () => {
    expect(canRemoveAt(['a'], 0, { requiresAtLeastOne: false })).toBe(true);
  });

  it('refuses the last image of a published product before a request exists', () => {
    expect(canRemoveAt(['a'], 0, { requiresAtLeastOne: true })).toBe(false);
    // With a second image the same product may drop either one.
    expect(canRemoveAt(['a', 'b'], 0, { requiresAtLeastOne: true })).toBe(true);
  });

  it('refuses an index that is not in the selection', () => {
    expect(canRemoveAt(['a'], 4, { requiresAtLeastOne: false })).toBe(false);
  });
});

describe('B2 refusal classification', () => {
  // The real normalizer runs, so these are the envelopes production classifies.
  const failure = (code: string, status: number) =>
    new ProductApiError(normalizeApiClientError(makeApiClientError({ status, code })));

  it('reads the domain code, never the status', () => {
    // Four different 409s that need four different next steps.
    expect(classifyMediaFailure(failure('PRODUCT_VERSION_CONFLICT', 409))).toBe('version-conflict');
    expect(classifyMediaFailure(failure('PRODUCT_MEDIA_NOT_PUBLISHABLE', 409))).toBe(
      'not-publishable',
    );
    expect(classifyMediaFailure(failure('PRODUCT_MEDIA_ASSET_UNAVAILABLE', 409))).toBe(
      'asset-unavailable',
    );
    expect(classifyMediaFailure(failure('PRODUCT_NOT_EDITABLE', 409))).toBe('not-editable');
    expect(classifyMediaFailure(failure('PRODUCT_MEDIA_DUPLICATE', 400))).toBe('duplicate');
    expect(classifyMediaFailure(failure('PRODUCT_MEDIA_ASSET_NOT_FOUND', 400))).toBe(
      'asset-not-found',
    );
  });

  it('claims nothing for a bare status or an unknown code', () => {
    expect(classifyMediaFailure(failure('SOMETHING_ELSE', 409))).toBe('generic');
    expect(classifyMediaFailure(new Error('offline'))).toBe('generic');
  });
});

/**
 * The read-side projection `APP12-M01.E1-C1` added, and the boundary it must not
 * cross: status reaches the screen, and never the request.
 */
describe('the media status projection (APP12-M01.E1-C1)', () => {
  const media = [
    makeProductMedia(0, { status: 'REJECTED' }),
    makeProductMedia(1, { status: 'ACCEPTED' }),
    makeProductMedia(2, { status: 'INSPECTING' }),
  ];

  it('carries each Asset status across the read boundary, keyed by Asset id', () => {
    const statuses = mediaStatusByAssetId(media);

    expect(statuses.get(media[0]!.assetId)).toBe('REJECTED');
    expect(statuses.get(media[1]!.assetId)).toBe('ACCEPTED');
    expect(statuses.get(media[2]!.assetId)).toBe('INSPECTING');
    expect(statuses.size).toBe(3);
  });

  it('leaves the write model exactly as it was — ids only, in position order', () => {
    // The defect this correction fixes was a *missing* read, never a wrong
    // write. Widening the ordered array into objects would have put a read-only
    // fact inside the request body's own type.
    const selection = selectionFromDetailMedia(media);

    expect(selection).toEqual(media.map((item) => item.assetId));
    expect(selection.every((entry) => typeof entry === 'string')).toBe(true);
    expect(JSON.stringify(selection)).not.toContain('REJECTED');
  });

  it('is keyed by Asset id, so an unsaved reorder cannot mislabel a tile', () => {
    const statuses = mediaStatusByAssetId(media);
    // The operator drags the rejected image to the end; nothing is saved.
    const reordered = [media[1]!.assetId, media[2]!.assetId, media[0]!.assetId];

    expect(reordered.map((id) => statuses.get(id))).toEqual(['ACCEPTED', 'INSPECTING', 'REJECTED']);
  });

  it('maps every wire status to one thumbnail state, and an unknown one to ABSENT', () => {
    expect(toAssetThumbnailState('ACCEPTED')).toBe('READY');
    expect(toAssetThumbnailState('UPLOADED')).toBe('PROCESSING');
    expect(toAssetThumbnailState('INSPECTING')).toBe('PROCESSING');
    expect(toAssetThumbnailState('REJECTED')).toBe('REJECTED');
    // Never a promise of an image for a state this screen does not know.
    expect(toAssetThumbnailState('SOME_FUTURE_STATE')).toBe('ABSENT');
    expect(toAssetThumbnailState(undefined)).toBe('ABSENT');
  });

  it('gives every non-ready state approved words rather than its code', () => {
    for (const state of ['PROCESSING', 'REJECTED', 'ABSENT'] as const) {
      const caption = assetThumbnailCaption(state);
      expect(caption.length).toBeGreaterThan(0);
      expect(caption).not.toContain(state);
    }
  });
});
