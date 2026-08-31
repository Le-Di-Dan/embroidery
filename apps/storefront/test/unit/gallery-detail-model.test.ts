import { isPublicGalleryEntrySlug, toGalleryDetailView } from '../../src/features/gallery-detail';
import {
  galleryMediaAlt,
  galleryPositionLabel,
  galleryThumbnailLabel,
} from '../../src/features/gallery-detail/model/gallery-detail-copy';
import {
  buildStorefrontGalleryDetailPath,
  isStorefrontNavRouteActive,
  STOREFRONT_GALLERY_ROUTE,
} from '../../src/features/storefront-shell/model/storefront-navigation';
import { galleryDetailActionLabel } from '../../src/features/gallery-feed/model/gallery-copy';
import {
  makeGalleryAsset,
  makeGalleryDetail,
  GALLERY_DETAIL_SLUG,
} from '../support/gallery-fixture';

describe('the detail projection', () => {
  it('drops every internal identity, ordering and SEO field', () => {
    const view = toGalleryDetailView(makeGalleryDetail());

    expect(Object.keys(view).sort()).toEqual([
      'description',
      'linkedProduct',
      'media',
      'slug',
      'title',
    ]);
    // The asset keeps its address and nothing else: no opaque id and no
    // position, which is the array index by construction.
    expect(Object.keys(view.media[0] ?? {})).toEqual(['url']);
  });

  it('preserves the API media order exactly', () => {
    const entry = makeGalleryDetail({
      assets: [makeGalleryAsset(2), makeGalleryAsset(0), makeGalleryAsset(1)],
    });

    // Deliberately handed out of ascending id order: the API's array order IS
    // the curation, so the projection must not "fix" it.
    expect(toGalleryDetailView(entry).media.map((item) => item.url)).toEqual(
      entry.assets.map((asset) => asset.url),
    );
  });

  it('omits an empty description rather than rendering an empty section', () => {
    expect(
      toGalleryDetailView(makeGalleryDetail({ description: '   ' })).description,
    ).toBeUndefined();
    expect(toGalleryDetailView(makeGalleryDetail({ description: '' })).description).toBeUndefined();
  });

  it('carries a linked product through with no shop fields, or null', () => {
    const linked = toGalleryDetailView(
      makeGalleryDetail({
        linkedProduct: { slug: 'gau-bong', name: 'Gấu bông', thumbnailUrl: '/x.webp' },
      }),
    ).linkedProduct;

    expect(linked).toEqual({ slug: 'gau-bong', name: 'Gấu bông', thumbnailUrl: '/x.webp' });
    expect(
      toGalleryDetailView(makeGalleryDetail({ linkedProduct: null })).linkedProduct,
    ).toBeNull();
  });

  it('omits an absent product thumbnail rather than nulling it', () => {
    const linked = toGalleryDetailView(
      makeGalleryDetail({ linkedProduct: { slug: 'ao-theu', name: 'Áo thêu' } }),
    ).linkedProduct;

    expect(linked).not.toBeNull();
    expect('thumbnailUrl' in (linked as object)).toBe(false);
  });

  it('never mutates or aliases the response it was given', () => {
    const entry = makeGalleryDetail();
    const view = toGalleryDetailView(entry);

    expect(view.media).not.toBe(entry.assets);
    expect(entry.assets).toHaveLength(3);
  });
});

describe('the slug syntax gate', () => {
  it.each(['ky-niem-duoc-giu-lai', 'mua-he', 'a1', '2026-mua-thu'])('accepts %p', (slug) => {
    expect(isPublicGalleryEntrySlug(slug)).toBe(true);
  });

  it.each([
    '',
    'UPPER',
    'Có Dấu',
    'a b',
    '-leading',
    'trailing-',
    'double--dash',
    '../etc/passwd',
    'a/b',
    'slug?x=1',
    'slug#frag',
    'slug%2F',
  ])('rejects %p before it can become a request', (slug) => {
    expect(isPublicGalleryEntrySlug(slug)).toBe(false);
  });

  it('agrees with the charset the API generates and validates', () => {
    // The API's own `GALLERY_ENTRY_SLUG_PATTERN`. Asserted here rather than
    // imported: the storefront may not reach into an API module, but the two
    // spellings must not drift, and this fails loudly if the server widens it.
    expect(String(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).toBe('/^[a-z0-9]+(?:-[a-z0-9]+)*$/');
    expect(isPublicGalleryEntrySlug(GALLERY_DETAIL_SLUG)).toBe(true);
  });
});

describe('the canonical route family', () => {
  it('builds the entry path beneath the feed, with no invented level', () => {
    expect(buildStorefrontGalleryDetailPath('ky-niem')).toBe('/bo-suu-tap/ky-niem');
  });

  it('encodes anything a caller that skipped the syntax gate could smuggle in', () => {
    expect(buildStorefrontGalleryDetailPath('a/b')).toBe('/bo-suu-tap/a%2Fb');
    expect(buildStorefrontGalleryDetailPath('a?b')).toBe('/bo-suu-tap/a%3Fb');
  });

  it('keeps the header Bộ sưu tập item active on a detail path', () => {
    expect(isStorefrontNavRouteActive('/bo-suu-tap/ky-niem', STOREFRONT_GALLERY_ROUTE)).toBe(true);
    expect(isStorefrontNavRouteActive('/bo-suu-tap-cu', STOREFRONT_GALLERY_ROUTE)).toBe(false);
  });
});

describe('derived accessible text', () => {
  it('names the entry and the position, and drops the position when there is one image', () => {
    expect(galleryMediaAlt('Kỷ niệm', 1, 3)).toBe('Kỷ niệm — ảnh 2 trên 3');
    expect(galleryMediaAlt('Kỷ niệm', 0, 1)).toBe('Kỷ niệm');
  });

  it('numbers thumbnail and position labels from one', () => {
    expect(galleryThumbnailLabel(0, 4)).toBe('Xem ảnh 1 trên 4');
    expect(galleryPositionLabel(3, 4)).toBe('Ảnh 4 trên 4');
  });

  it('gives every feed card action a name that distinguishes it', () => {
    expect(galleryDetailActionLabel('Kỷ niệm được giữ lại')).toBe(
      'Xem chi tiết mục Kỷ niệm được giữ lại',
    );
    expect(galleryDetailActionLabel('Mùa hè')).not.toBe(
      galleryDetailActionLabel('Kỷ niệm được giữ lại'),
    );
  });
});
