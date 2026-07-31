/**
 * The pure form model: request-body construction, description semantics, price
 * handling, media ordering and asset eligibility.
 *
 * These are the rules a screen test cannot pin precisely — "only changed fields
 * are sent" and "untouched is not the same as cleared" are properties of the
 * body, not of the DOM — so they are asserted directly against the functions
 * that build the request.
 */
import {
  buildCreateBody,
  buildUpdateBody,
  formValuesFromDetail,
  isFormDirty,
  type ProductFormValues,
} from '../../src/features/products/model/product-form-values';
import {
  formatPriceAmount,
  inputToPriceAmount,
  isPriceUnset,
  priceAmountToInput,
  PRICE_NOT_SET,
} from '../../src/features/products/model/product-price';
import {
  addToSelection,
  canMove,
  hasSelectionChanged,
  moveSelection,
  removeFromSelection,
  roleForPosition,
  selectionFromDetailMedia,
} from '../../src/features/products/model/product-media-selection';
import {
  flattenSelectableAssets,
  isSelectableAsset,
  resolveAssetCursor,
} from '../../src/features/products/model/product-asset-eligibility';
import {
  buildMediaMetaLine,
  resolveMediaTitle,
} from '../../src/features/products/model/product-media-identity';
import { makeAsset, makePage } from '../support/asset-fixture';
import { makeProductDetail, makeProductMedia } from '../support/product-fixture';

const TOKEN = '2026-07-28T09:16:00.000Z';

describe('create body', () => {
  it('sends exactly the three POST-supported fields', () => {
    const body = buildCreateBody({
      name: '  Khăn tay thêu sen đỏ  ',
      categorySlug: 'khan',
      description: '  Mô tả ngắn  ',
      price: '450000',
      mediaAssetIds: ['asset-1'],
    });

    expect(body).toEqual({
      categorySlug: 'khan',
      name: 'Khăn tay thêu sen đỏ',
      description: 'Mô tả ngắn',
    });
    // Price, media, slug and status are not part of create at all.
    expect(Object.keys(body ?? {})).toEqual(['categorySlug', 'name', 'description']);
  });

  it('omits an empty description rather than sending a blank one', () => {
    const body = buildCreateBody({
      name: 'Khăn',
      categorySlug: 'khan',
      description: '   ',
      price: '',
      mediaAssetIds: [],
    });

    expect(body).toEqual({ categorySlug: 'khan', name: 'Khăn' });
    expect(body).not.toHaveProperty('description');
  });

  it('refuses to build a body without a category', () => {
    expect(
      buildCreateBody({
        name: 'Khăn',
        categorySlug: '',
        description: '',
        price: '',
        mediaAssetIds: [],
      }),
    ).toBeNull();
  });
});

describe('update body', () => {
  const initial: ProductFormValues = {
    name: 'Khăn tay thêu sen đỏ',
    categorySlug: 'khan',
    description: 'Mô tả cũ',
    price: '450000',
    mediaAssetIds: ['asset-1', 'asset-2'],
  };

  it('sends only the changed field plus the concurrency token', () => {
    const body = buildUpdateBody(initial, { ...initial, name: 'Tên mới' }, TOKEN);

    expect(body).toEqual({ expectedUpdatedAt: TOKEN, name: 'Tên mới' });
  });

  it('returns null when nothing changed, so no empty PATCH is sent', () => {
    expect(buildUpdateBody(initial, { ...initial }, TOKEN)).toBeNull();
    expect(isFormDirty(initial, { ...initial })).toBe(false);
  });

  it('never carries slug or status', () => {
    const body = buildUpdateBody(initial, { ...initial, name: 'X' }, TOKEN);

    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('status');
  });

  describe('description', () => {
    it('leaves an untouched description out of the body entirely', () => {
      const body = buildUpdateBody(initial, { ...initial, name: 'Tên mới' }, TOKEN);

      expect(body).not.toHaveProperty('description');
    });

    it('sends null when the operator clears it, which is what NULLs the column', () => {
      const body = buildUpdateBody(initial, { ...initial, description: '' }, TOKEN);

      expect(body).toEqual({ expectedUpdatedAt: TOKEN, description: null });
    });

    it('treats whitespace-only as a clear, not as a value', () => {
      const body = buildUpdateBody(initial, { ...initial, description: '   ' }, TOKEN);

      expect(body?.description).toBeNull();
    });

    it('does not clear a description that was already empty', () => {
      const blank = { ...initial, description: '' };
      const body = buildUpdateBody(blank, { ...blank, name: 'Tên mới' }, TOKEN);

      expect(body).not.toHaveProperty('description');
    });
  });

  describe('price', () => {
    it('sends the digits as a string, never a number', () => {
      const body = buildUpdateBody(initial, { ...initial, price: '500000' }, TOKEN);

      expect(body?.basePriceAmount).toBe('500000');
      expect(typeof body?.basePriceAmount).toBe('string');
    });

    it('maps a cleared price to the "0" sentinel', () => {
      const body = buildUpdateBody(initial, { ...initial, price: '' }, TOKEN);

      expect(body?.basePriceAmount).toBe(PRICE_NOT_SET);
    });

    it('omits an invalid price instead of sending a rejected value', () => {
      const body = buildUpdateBody(initial, { ...initial, price: '-50000', name: 'X' }, TOKEN);

      expect(body).not.toHaveProperty('basePriceAmount');
    });
  });

  describe('media', () => {
    it('omits mediaAssetIds when the selection is untouched', () => {
      const body = buildUpdateBody(initial, { ...initial, name: 'X' }, TOKEN);

      expect(body).not.toHaveProperty('mediaAssetIds');
    });

    it('sends the whole ordered list when the order alone changed', () => {
      const body = buildUpdateBody(
        initial,
        { ...initial, mediaAssetIds: ['asset-2', 'asset-1'] },
        TOKEN,
      );

      expect(body?.mediaAssetIds).toEqual(['asset-2', 'asset-1']);
    });

    it('sends an empty list when every image was removed', () => {
      const body = buildUpdateBody(initial, { ...initial, mediaAssetIds: [] }, TOKEN);

      expect(body?.mediaAssetIds).toEqual([]);
    });
  });
});

describe('seeding from the authoritative record', () => {
  it('renders the "0" sentinel as an empty price field', () => {
    const values = formValuesFromDetail(makeProductDetail({ basePriceAmount: '0' }));

    expect(values.price).toBe('');
  });

  it('treats an absent description as empty without marking the form dirty', () => {
    const detail = makeProductDetail();
    delete (detail as { description?: string }).description;
    const values = formValuesFromDetail(detail);

    expect(values.description).toBe('');
    expect(isFormDirty(values, values)).toBe(false);
  });

  it('orders media by position and keeps ids distinct', () => {
    const detail = makeProductDetail({
      media: [makeProductMedia(1), makeProductMedia(0), makeProductMedia(1)],
    });

    expect(formValuesFromDetail(detail).mediaAssetIds).toEqual([
      makeProductMedia(0).assetId,
      makeProductMedia(1).assetId,
    ]);
  });

  it('falls back to "not chosen" for a category this build does not know', () => {
    const detail = makeProductDetail({
      category: { name: 'Không rõ', slug: 'khong-ro' as never },
    });

    expect(formValuesFromDetail(detail).categorySlug).toBe('');
  });
});

describe('price semantics', () => {
  it.each([
    ['0', true],
    ['000', true],
    ['', true],
    ['1', false],
    ['450000', false],
  ])('isPriceUnset(%s) === %s', (input, expected) => {
    expect(isPriceUnset(input)).toBe(expected);
  });

  it('accepts up to twelve digits and rejects thirteen', () => {
    expect(inputToPriceAmount('9'.repeat(12))).toBe('9'.repeat(12));
    expect(inputToPriceAmount('9'.repeat(13))).toBeNull();
  });

  it.each(['-1', '1.5', '1,5', '1 000', 'abc', '1e6'])('rejects %s', (input) => {
    expect(inputToPriceAmount(input)).toBeNull();
  });

  it('never renders the unset sentinel as a completed price', () => {
    expect(formatPriceAmount('0')).not.toContain('0 ₫');
    expect(formatPriceAmount('450000')).toBe('450.000 ₫');
  });

  it('round-trips a large amount without floating-point drift', () => {
    const large = '999999999999';
    expect(inputToPriceAmount(priceAmountToInput(large))).toBe(large);
  });
});

describe('media ordering', () => {
  const selection = ['a', 'b', 'c'];

  it('derives THUMBNAIL from position 0 and GALLERY from the rest', () => {
    expect(roleForPosition(0)).toBe('THUMBNAIL');
    expect(roleForPosition(1)).toBe('GALLERY');
    expect(roleForPosition(9)).toBe('GALLERY');
  });

  it('never produces a DETAIL role', () => {
    for (let index = 0; index < 5; index += 1) {
      expect(roleForPosition(index)).not.toBe('DETAIL');
    }
  });

  it('moves an entry and leaves the rest in order', () => {
    expect(moveSelection(selection, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveSelection(selection, 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('refuses to move past either end', () => {
    expect(canMove(selection, 0, -1)).toBe(false);
    expect(canMove(selection, 2, 1)).toBe(false);
    expect(moveSelection(selection, 0, -1)).toEqual(selection);
  });

  it('keeps ids distinct when adding', () => {
    expect(addToSelection(selection, ['b', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes only the named entry', () => {
    expect(removeFromSelection(selection, 'b')).toEqual(['a', 'c']);
  });

  it('detects a reorder as a change, not just a membership difference', () => {
    expect(hasSelectionChanged(selection, ['a', 'c', 'b'])).toBe(true);
    expect(hasSelectionChanged(selection, ['a', 'b', 'c'])).toBe(false);
  });

  it('reads an unordered response by position', () => {
    expect(selectionFromDetailMedia([makeProductMedia(1), makeProductMedia(0)])).toEqual([
      makeProductMedia(0).assetId,
      makeProductMedia(1).assetId,
    ]);
  });
});

describe('asset eligibility', () => {
  it('accepts only ACCEPTED catalog media with the production classification', () => {
    expect(isSelectableAsset(makeAsset())).toBe(true);
    expect(isSelectableAsset(makeAsset({ status: 'INSPECTING' }))).toBe(false);
    expect(isSelectableAsset(makeAsset({ status: 'REJECTED' }))).toBe(false);
    expect(isSelectableAsset(makeAsset({ kind: 'ARTWORK' as never }))).toBe(false);
    expect(isSelectableAsset(makeAsset({ classification: 'PUBLIC' as never }))).toBe(false);
  });

  it('drops ineligible assets and duplicates while preserving server order', () => {
    const first = makeAsset({ assetId: 'a-1' });
    const processing = makeAsset({ assetId: 'a-2', status: 'INSPECTING' });
    const second = makeAsset({ assetId: 'a-3' });
    const repeat = makeAsset({ assetId: 'a-1' });

    const flat = flattenSelectableAssets([
      makePage([first, processing], 'cursor'),
      makePage([repeat, second]),
    ]);

    expect(flat.map((asset) => asset.assetId)).toEqual(['a-1', 'a-3']);
  });

  it('treats a missing or blank cursor as the end of the collection', () => {
    expect(resolveAssetCursor(makePage([], 'next'))).toBe('next');
    expect(resolveAssetCursor(makePage([]))).toBeUndefined();
    expect(resolveAssetCursor({ hasNext: true, items: [], nextCursor: '' })).toBeUndefined();
  });
});

describe('media identity', () => {
  it('uses the server media type, never a filename', () => {
    expect(resolveMediaTitle('image/png')).toBe('Ảnh PNG');
    expect(resolveMediaTitle('image/jpeg')).toBe('Ảnh JPEG');
    expect(resolveMediaTitle('image/webp')).toBe('Ảnh WebP');
    expect(resolveMediaTitle('application/pdf')).toBe('Tài sản hình ảnh');
    expect(resolveMediaTitle(undefined)).toBe('Tài sản hình ảnh');
  });

  it('builds the approved "{size} · {createdAt}" secondary line', () => {
    expect(buildMediaMetaLine(2_516_582, '2026-07-27T14:35:00.000Z')).toMatch(
      /^2,4 MB · \d{2}\/\d{2}\/2026, \d{2}:\d{2}$/,
    );
  });

  it('falls back to neutral copy rather than echoing an unusable value', () => {
    expect(buildMediaMetaLine(Number.NaN, '')).toBe('Chưa có thông tin chi tiết');
    expect(buildMediaMetaLine(-1, 'not-a-date')).toBe('Chưa có thông tin chi tiết');
  });
});
