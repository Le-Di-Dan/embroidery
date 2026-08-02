import { isPublicProductSlug } from '@embroidery/contracts';

import {
  buildStorefrontProductDetailPath,
  STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE,
} from '../../src/features/storefront-shell';
import { toProductDetailView } from '../../src/features/product-detail';
import {
  mainMediaAlt,
  positionLabel,
  thumbnailLabel,
} from '../../src/features/product-detail/model/product-detail-copy';
import { canonicalShareUrl } from '../../src/features/product-detail/hooks/use-share';
import {
  makePublicDetail,
  makePublicDetailWithoutDescription,
} from '../support/product-detail-fixture';

describe('product detail route helper', () => {
  it('builds the exact locked route', () => {
    expect(STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE).toBe('/san-pham');
    expect(buildStorefrontProductDetailPath('gau-bong-theu-tay')).toBe(
      '/san-pham/gau-bong-theu-tay',
    );
  });

  it('encodes a slug so no caller can write path syntax into it', () => {
    expect(buildStorefrontProductDetailPath('a/b?c#d')).toBe('/san-pham/a%2Fb%3Fc%23d');
  });

  it('never emits a rejected alias', () => {
    const path = buildStorefrontProductDetailPath('x');
    for (const alias of ['/product/', '/products/', '/catalog/', '/tac-pham', '/kham-pha/']) {
      expect(path.startsWith(alias)).toBe(false);
    }
  });
});

describe('public product slug syntax', () => {
  it('accepts the server-owned slug shape', () => {
    expect(isPublicProductSlug('gau-bong-theu-tay')).toBe(true);
    expect(isPublicProductSlug('abc123')).toBe(true);
  });

  it('rejects what cannot be a slug', () => {
    for (const value of ['', 'Upper', 'has space', '-leading', 'trailing-', 'a--b', '../etc']) {
      expect(isPublicProductSlug(value)).toBe(false);
    }
  });
});

describe('toProductDetailView', () => {
  it('drops price and the stock flag at the boundary', () => {
    const view = toProductDetailView(makePublicDetail());
    expect(Object.keys(view)).not.toContain('price');
    expect(Object.keys(view)).not.toContain('isDisplayOutOfStock');
    expect(JSON.stringify(view)).not.toContain('450000');
    expect(JSON.stringify(view)).not.toContain('VND');
  });

  it('preserves media in server order', () => {
    const view = toProductDetailView(makePublicDetail());
    expect(view.media.map((m) => m.url)).toEqual([
      '/api/public/products/gau-bong-theu-tay/media/m-1/catalog-preview',
      '/api/public/products/gau-bong-theu-tay/media/m-2/catalog-preview',
      '/api/public/products/gau-bong-theu-tay/media/m-3/catalog-preview',
    ]);
  });

  it('omits an absent description rather than inventing an empty one', () => {
    const view = toProductDetailView(makePublicDetailWithoutDescription());
    expect(view.description).toBeUndefined();
    expect('description' in view).toBe(false);
  });

  it('treats a blank description as absent', () => {
    const view = toProductDetailView(makePublicDetail({ description: '   ' }));
    expect(view.description).toBeUndefined();
  });

  it('keeps an empty media list empty', () => {
    expect(toProductDetailView(makePublicDetail({ media: [] })).media).toEqual([]);
  });
});

describe('accessible labels', () => {
  it('names the main image from Product-owned text and position only', () => {
    expect(mainMediaAlt('Gấu bông thêu tay', 0, 3)).toBe('Gấu bông thêu tay — ảnh 1 trên 3');
  });

  it('labels thumbnails by index, never by an invented caption', () => {
    expect(thumbnailLabel(1, 6)).toBe('Xem ảnh 2 trên 6');
  });

  it('exposes the lightbox position as text', () => {
    expect(positionLabel(2, 6)).toBe('Ảnh 3 trên 6');
  });
});

describe('canonical share URL', () => {
  it('joins the origin with the route helper only', () => {
    expect(canonicalShareUrl('https://example.test', '/san-pham/x')).toBe(
      'https://example.test/san-pham/x',
    );
  });

  it('carries no query string or fragment from the visitor session', () => {
    const url = canonicalShareUrl('https://example.test', buildStorefrontProductDetailPath('x'));
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });
});
