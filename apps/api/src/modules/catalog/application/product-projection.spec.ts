/**
 * The safe Admin projection.
 *
 * The projection is where a row stops being a row, so these tests are mostly
 * about what is *absent*: a field that never reaches this file can never reach
 * a browser, whatever the repository loaded.
 */
import { toDetailView, toSummaryView } from './product-projection';
import type {
  ProductDraft,
  ProductDraftId,
  ProductDraftMedia,
} from '../domain/repositories/product-draft.repository';

const PRODUCT: ProductDraft = {
  id: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' as ProductDraftId,
  categoryId: '019a0000-0000-7000-8000-000000000001',
  categorySlug: 'thu-bong',
  categoryName: 'Thú bông',
  name: 'Gấu nâu',
  slug: 'gau-nau',
  description: 'Mô tả',
  basePriceAmount: '0',
  currencyCode: 'VND',
  status: 'DRAFT',
  displayOrder: 0,
  archivedAt: undefined,
  createdAt: new Date('2026-07-31T09:00:00.000Z'),
  updatedAt: new Date('2026-07-31T10:00:00.000Z'),
};

const MEDIA: ProductDraftMedia[] = [
  {
    assetId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07',
    role: 'THUMBNAIL',
    displayOrder: 0,
    mediaType: 'image/png',
    byteSize: 51_200n,
    status: 'ACCEPTED',
    assetCreatedAt: new Date('2026-07-30T08:00:00.000Z'),
  },
  {
    assetId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08',
    role: 'GALLERY',
    displayOrder: 1,
    mediaType: 'image/webp',
    byteSize: 40_000n,
    status: 'ACCEPTED',
    assetCreatedAt: new Date('2026-07-30T08:05:00.000Z'),
  },
];

describe('product summary projection', () => {
  it('addresses the category by slug and labels it from the locked taxonomy', () => {
    const view = toSummaryView(PRODUCT, MEDIA);
    expect(view.category).toEqual({ slug: 'thu-bong', name: 'Thú bông' });
  });

  it('never exposes the physical category id', () => {
    const serialized = JSON.stringify(toSummaryView(PRODUCT, MEDIA));
    expect(serialized).not.toContain(PRODUCT.categoryId);
    expect(serialized).not.toContain('categoryId');
  });

  it('keeps money a string and the concurrency token an ISO instant', () => {
    const view = toSummaryView(PRODUCT, MEDIA);
    expect(view.basePriceAmount).toBe('0');
    expect(typeof view.basePriceAmount).toBe('string');
    expect(view.currencyCode).toBe('VND');
    expect(view.updatedAt).toBe('2026-07-31T10:00:00.000Z');
  });

  it('surfaces the first selected image as the primary one', () => {
    const view = toSummaryView(PRODUCT, MEDIA);
    expect(view.primaryMedia?.assetId).toBe(MEDIA[0]?.assetId);
    expect(view.primaryMedia?.role).toBe('THUMBNAIL');
    expect(view.primaryMedia?.byteSize).toBe(51_200);
  });

  it('has no primary image when nothing is selected', () => {
    expect(toSummaryView(PRODUCT, []).primaryMedia).toBeUndefined();
  });
});

describe('product detail projection', () => {
  it('returns the ordered media selection', () => {
    const view = toDetailView(PRODUCT, MEDIA);
    expect(view.media.map((item) => [item.position, item.role])).toEqual([
      [0, 'THUMBNAIL'],
      [1, 'GALLERY'],
    ]);
  });

  it('exposes no media URL — APP2 has no delivery contract to build one from', () => {
    const serialized = JSON.stringify(toDetailView(PRODUCT, MEDIA));
    expect(serialized).not.toMatch(/thumbnailUrl|previewUrl|url"|https?:\/\//);
  });

  it('exposes no storage, checksum, derivative or inspection fact', () => {
    const serialized = JSON.stringify(toDetailView(PRODUCT, MEDIA)).toLowerCase();
    for (const forbidden of [
      'storagekey',
      'storage_key',
      'bucket',
      'checksum',
      'sha256',
      'minio',
      'derivative',
      'inspection',
      'isindexable',
      'seotitle',
      'seodescription',
      'displayorder',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });

  it('reports an archived instant only when the product is archived', () => {
    expect(toDetailView(PRODUCT, []).archivedAt).toBeUndefined();
    const archived = {
      ...PRODUCT,
      status: 'ARCHIVED' as const,
      archivedAt: new Date('2026-07-31T11:00:00.000Z'),
    };
    expect(toDetailView(archived, []).archivedAt).toBe('2026-07-31T11:00:00.000Z');
  });

  it('omits an absent description rather than inventing an empty string', () => {
    expect(toDetailView({ ...PRODUCT, description: undefined }, []).description).toBeUndefined();
  });
});
