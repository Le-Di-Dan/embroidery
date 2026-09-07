/**
 * The public projection boundary (`APP2-B04`).
 *
 * The central test here is the leak scan: it walks real projected values and
 * asserts that no internal identifier, storage detail or lifecycle field
 * appears anywhere in them. Walking the output rather than reading the source
 * is the point — a field added to the projection later is caught even though no
 * test names it.
 */
import {
  toPublicPrice,
  toPublicProductDetail,
  toPublicProductSummary,
} from './public-product.projection';
import type {
  PublicProductDetail,
  PublicProductListRow,
} from '../domain/repositories/public-product.repository';

const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const CATEGORY_ID = '019a0000-0000-7000-8000-000000000001';
const MEDIA_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
const SECOND_MEDIA_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08';

const LIST_ROW: PublicProductListRow = {
  id: PRODUCT_ID,
  displayOrder: 10,
  slug: 'khan-theu-hoa-sen',
  name: 'Khăn thêu hoa sen',
  basePriceAmount: '250000.000',
  currencyCode: 'VND',
  isDisplayOutOfStock: false,
  categorySlug: 'khan',
  categoryName: 'Khăn',
  thumbnailProductMediaId: MEDIA_ID,
  thumbnailSize: { width: 800, height: 1000 },
};

const DETAIL: PublicProductDetail = {
  product: {
    slug: 'khan-theu-hoa-sen',
    name: 'Khăn thêu hoa sen',
    description: 'Khăn bông cao cấp.',
    basePriceAmount: '250000.000',
    currencyCode: 'VND',
    isDisplayOutOfStock: false,
    seoTitle: 'Khăn thêu hoa sen thủ công',
    seoDescription: 'Đặt riêng theo yêu cầu.',
    isIndexable: true,
    categorySlug: 'khan',
    categoryName: 'Khăn',
  },
  media: [
    {
      productMediaId: MEDIA_ID,
      role: 'THUMBNAIL',
      displayOrder: 0,
      size: { width: 1600, height: 2000 },
      // Deliberately different from `size`: the two describe different
      // derivatives, and a projection that spread one for the other would
      // reserve a 1 600 px box for a 400 px image (`APP12-M01-B1` §5).
      thumbnailAvailable: true,
      thumbnailSize: { width: 400, height: 500 },
    },
    // The second image carries no stored dimensions, which is the legitimate
    // historical state APP12-H05-C1 must project as absence rather than a guess.
    {
      productMediaId: SECOND_MEDIA_ID,
      role: 'GALLERY',
      displayOrder: 1,
      size: undefined,
      thumbnailAvailable: true,
      thumbnailSize: undefined,
    },
  ],
};

/** Every string that appears anywhere in a projected value. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, member]) => [key, ...stringsIn(member)]);
  }
  return [];
}

describe('public catalog projection', () => {
  it('renders a whole-đồng price as an exact decimal string', () => {
    expect(toPublicPrice('250000.000', 'VND')).toEqual({ amount: '250000', currency: 'VND' });
    // Beyond Number.MAX_SAFE_INTEGER: the value must survive untouched, which
    // it only can because nothing here converts it to a number.
    expect(toPublicPrice('9007199254740993.000', 'VND').amount).toBe('9007199254740993');
    expect(toPublicPrice('0.000', 'VND').amount).toBe('0');
  });

  it('keeps the wire role vocabulary closed at two values', () => {
    // `DETAIL` exists in the database's closed role set and nothing writes it.
    // Since `APP12-M01-B1` the published role is derived from **position**, not
    // from the stored column, so an unexpected stored role cannot reach the wire
    // at all — it is unrepresentable rather than merely mapped away.
    const roles = toPublicProductDetail({
      ...DETAIL,
      media: DETAIL.media.map((item) => ({ ...item, role: 'DETAIL' })),
    }).media.map((item) => item.role);

    expect(roles).toEqual(['THUMBNAIL', 'GALLERY']);
  });

  it('projects a summary with a thumbnail address and no identifiers', () => {
    const summary = toPublicProductSummary(LIST_ROW);
    expect(summary).toEqual({
      slug: 'khan-theu-hoa-sen',
      name: 'Khăn thêu hoa sen',
      category: { slug: 'khan', name: 'Khăn' },
      price: { amount: '250000', currency: 'VND' },
      isDisplayOutOfStock: false,
      thumbnail: {
        url: `/api/public/products/khan-theu-hoa-sen/media/${MEDIA_ID}/thumbnail`,
        role: 'THUMBNAIL',
        // The list row's own list-rendition size (APP12-H05-C1), carried through
        // verbatim rather than recomputed.
        width: 800,
        height: 1000,
      },
    });
  });

  it('omits the thumbnail rather than fabricating an address', () => {
    const summary = toPublicProductSummary({ ...LIST_ROW, thumbnailProductMediaId: undefined });
    expect(summary).not.toHaveProperty('thumbnail');
    expect(JSON.stringify(summary)).not.toContain('media');
  });

  it('projects detail media in repository order using the preview rendition', () => {
    const detail = toPublicProductDetail(DETAIL);
    expect(detail.media).toEqual([
      {
        url: `/api/public/products/khan-theu-hoa-sen/media/${MEDIA_ID}/catalog-preview`,
        role: 'THUMBNAIL',
        width: 1600,
        height: 2000,
        thumbnailUrl: `/api/public/products/khan-theu-hoa-sen/media/${MEDIA_ID}/thumbnail`,
        thumbnailWidth: 400,
        thumbnailHeight: 500,
      },
      {
        // No size at all: this fixture's derivative stores none, and absence
        // must stay absence rather than becoming a guess (APP12-H05-C1).
        url: `/api/public/products/khan-theu-hoa-sen/media/${SECOND_MEDIA_ID}/catalog-preview`,
        role: 'GALLERY',
        thumbnailUrl: `/api/public/products/khan-theu-hoa-sen/media/${SECOND_MEDIA_ID}/thumbnail`,
      },
    ]);
  });

  it('addresses one association at two renditions, each with its own dimensions', () => {
    const [first] = toPublicProductDetail(DETAIL).media;
    // Same association id in both paths — only the rendition segment differs.
    expect(first?.url).toContain(`/media/${MEDIA_ID}/`);
    expect(first?.thumbnailUrl).toContain(`/media/${MEDIA_ID}/`);
    expect(first?.url.endsWith('/catalog-preview')).toBe(true);
    expect(first?.thumbnailUrl?.endsWith('/thumbnail')).toBe(true);
    // The two sizes must never be the same value spread twice: reserving the
    // preview's box for a 400 px strip control is the defect this pair exists
    // to prevent (`APP12-M01-B1` §5).
    expect([first?.width, first?.height]).toEqual([1600, 2000]);
    expect([first?.thumbnailWidth, first?.thumbnailHeight]).toEqual([400, 500]);
  });

  it('omits the thumbnail address entirely when that derivative is not deliverable', () => {
    const detail = toPublicProductDetail({
      ...DETAIL,
      media: [
        {
          ...DETAIL.media[0]!,
          thumbnailAvailable: false,
          thumbnailSize: { width: 400, height: 500 },
        },
      ],
    });
    // Absent rather than nulled, and the size is withheld with it: a dimension
    // pair describing an address the client was not given is worse than none.
    expect(detail.media[0]).not.toHaveProperty('thumbnailUrl');
    expect(detail.media[0]).not.toHaveProperty('thumbnailWidth');
    expect(detail.media[0]).not.toHaveProperty('thumbnailHeight');
    // The large address is untouched, so the image is still rendered.
    expect(detail.media[0]?.url).toContain('/catalog-preview');
  });

  it('publishes the effective primary at index 0 even when the stored role degraded', () => {
    // What the repository returns for a product whose stored THUMBNAIL asset
    // has become undeliverable: it is filtered out, and the lowest-display-order
    // survivor sorts first while still carrying its persisted GALLERY role.
    const detail = toPublicProductDetail({
      ...DETAIL,
      media: [
        { ...DETAIL.media[1]!, role: 'GALLERY', displayOrder: 1 },
        { ...DETAIL.media[0]!, role: 'GALLERY', displayOrder: 2 },
      ],
    });
    // Position decides the published role, so the card, `media[0]`, `og:image`
    // and the JSON-LD list all name the same image (`APP12-M01-B1` §6).
    expect(detail.media.map((item) => item.role)).toEqual(['THUMBNAIL', 'GALLERY']);
    expect(detail.media[0]?.url).toContain(`/media/${SECOND_MEDIA_ID}/`);
  });

  it('exposes only SEO facts that physically exist, and no canonical URL', () => {
    const detail = toPublicProductDetail(DETAIL);
    expect(detail.seo).toEqual({
      title: 'Khăn thêu hoa sen thủ công',
      description: 'Đặt riêng theo yêu cầu.',
      isIndexable: true,
    });
    // The Storefront route is undecided; nothing here may lock it.
    expect(JSON.stringify(detail)).not.toContain('/san-pham/');
    expect(detail.seo).not.toHaveProperty('canonicalUrl');
    expect(detail.seo).not.toHaveProperty('ogUrl');
    expect(detail.seo).not.toHaveProperty('socialImage');
  });

  it('omits absent SEO text instead of emitting an empty string', () => {
    const detail = toPublicProductDetail({
      ...DETAIL,
      product: { ...DETAIL.product, seoTitle: undefined, seoDescription: undefined },
    });
    expect(detail.seo).toEqual({ isIndexable: true });
  });

  it('leaks no internal identifier, storage detail or lifecycle field', () => {
    const projections = [
      toPublicProductSummary(LIST_ROW),
      toPublicProductSummary({ ...LIST_ROW, thumbnailProductMediaId: undefined }),
      toPublicProductDetail(DETAIL),
    ];
    for (const projection of projections) {
      const strings = stringsIn(projection);
      const serialized = JSON.stringify(projection);

      // The product and category ids never appear at all.
      expect(serialized).not.toContain(PRODUCT_ID);
      expect(serialized).not.toContain(CATEGORY_ID);

      // No forbidden property name anywhere in the tree.
      for (const forbidden of [
        'id',
        'productId',
        'categoryId',
        'assetId',
        'productMediaId',
        'derivativeId',
        'storageKey',
        'bucket',
        'checksum',
        'etag',
        'status',
        'archivedAt',
        'createdAt',
        'updatedAt',
        'displayOrder',
      ]) {
        expect(strings).not.toContain(forbidden);
      }

      // The association id survives only inside a media path — the one place
      // APP2-T01 authorises it — and never as a standalone property.
      for (const value of strings) {
        if (value.includes(MEDIA_ID)) {
          expect(value.startsWith('/api/public/products/')).toBe(true);
        }
      }
      expect(serialized).not.toMatch(/https?:\/\//);
      expect(serialized).not.toMatch(/minio|amazonaws|X-Amz|signature/i);
    }
  });
});
