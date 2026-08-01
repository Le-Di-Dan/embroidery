import {
  buildPublicProductMediaPath,
  PUBLIC_PRODUCT_MEDIA_PATH_PREFIX,
  PUBLIC_PRODUCT_MEDIA_RENDITIONS,
  PublicProductMediaPathError,
} from './public-product-media-path';

const SLUG = 'thu-bong-gau-nau';
const MEDIA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

describe('buildPublicProductMediaPath', () => {
  it('builds the exact documented path for each rendition', () => {
    expect(
      buildPublicProductMediaPath({
        slug: SLUG,
        productMediaId: MEDIA_ID,
        rendition: 'thumbnail',
      }),
    ).toBe(`/api/public/products/${SLUG}/media/${MEDIA_ID}/thumbnail`);

    expect(
      buildPublicProductMediaPath({
        slug: SLUG,
        productMediaId: MEDIA_ID,
        rendition: 'catalog-preview',
      }),
    ).toBe(`/api/public/products/${SLUG}/media/${MEDIA_ID}/catalog-preview`);
  });

  it('offers exactly the two approved renditions', () => {
    expect([...PUBLIC_PRODUCT_MEDIA_RENDITIONS]).toStrictEqual(['thumbnail', 'catalog-preview']);
  });

  it('returns a relative application path with no host, protocol or storage base', () => {
    const path = buildPublicProductMediaPath({
      slug: SLUG,
      productMediaId: MEDIA_ID,
      rendition: 'thumbnail',
    });

    expect(path.startsWith(PUBLIC_PRODUCT_MEDIA_PATH_PREFIX)).toBe(true);
    expect(path).not.toMatch(/^[a-z]+:\/\//);
    expect(path).not.toMatch(/minio|amazonaws|s3|localhost|:9000/i);
    // A signature or expiry would mean the address itself grants access.
    expect(path).not.toMatch(/[?#]/);
  });

  it.each([
    ['empty', ''],
    ['uppercase', 'Thu-Bong'],
    ['traversal', '../../etc/passwd'],
    ['slash', 'thu/bong'],
    ['leading separator', '-thu-bong'],
    ['space', 'thu bong'],
  ])('rejects a %s slug', (_label, slug) => {
    expect(() =>
      buildPublicProductMediaPath({ slug, productMediaId: MEDIA_ID, rendition: 'thumbnail' }),
    ).toThrow(PublicProductMediaPathError);
  });

  it.each([
    ['empty', ''],
    ['not a uuid', 'not-a-uuid'],
    ['uppercase', MEDIA_ID.toUpperCase()],
    ['traversal', '../secret'],
    ['a storage key', 'development/derivatives/019a/THUMBNAIL.webp'],
  ])('rejects a %s product media id', (_label, productMediaId) => {
    expect(() =>
      buildPublicProductMediaPath({ slug: SLUG, productMediaId, rendition: 'thumbnail' }),
    ).toThrow(PublicProductMediaPathError);
  });

  it('rejects a rendition outside the approved set', () => {
    expect(() =>
      buildPublicProductMediaPath({
        slug: SLUG,
        productMediaId: MEDIA_ID,
        // A caller reaching past the union is exactly what the guard exists for.
        rendition: 'original' as never,
      }),
    ).toThrow(PublicProductMediaPathError);
  });
});
