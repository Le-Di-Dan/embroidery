import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { GalleryMasonry } from '../../src/features/gallery-feed/components/gallery-masonry';
import { flattenGalleryPages } from '../../src/features/gallery-feed/model/gallery-feed';
import { ProductMasonry } from '../../src/features/product-discovery/components/product-masonry';
import { flattenDiscoverPages } from '../../src/features/product-discovery/model/discover-feed';
import { makeGalleryEntry, makeGalleryPage } from '../support/gallery-fixture';
import { makePublicPage, makePublicProduct } from '../support/discover-fixture';

/**
 * `APP12-H05-C1` — the two grids reserve each image's box before its bytes land.
 *
 * `APP12-H05` measured CLS over 0.10 on Discover and the Gallery feed: the card
 * images carried no `width`/`height`, so every box was zero-height until the
 * bytes arrived and the grid grew under content the visitor was already reading.
 *
 * These are the unit-level half of the correction. They prove the attributes are
 * rendered from the API's authoritative values and, just as importantly, that
 * **nothing is invented when the API publishes no size** — the browser-level
 * half (that a reserved box actually removes the shift) is proved live in the
 * `APP12-H05-C1` remeasurement, because no jsdom assertion can observe layout.
 *
 * The fixtures use a non-square 4:5 ratio throughout, so a square-assuming
 * fallback would be visible rather than accidentally correct.
 */

const WIDTH = 800;
const HEIGHT = 1000;

describe('Discover grid intrinsic dimensions', () => {
  it('renders width and height from the API values', () => {
    const cards = flattenDiscoverPages([
      makePublicPage([
        makePublicProduct({
          slug: 'gau-bong-theu-tay',
          name: 'Gấu bông thêu tay',
          thumbnail: {
            role: 'THUMBNAIL',
            url: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
            width: WIDTH,
            height: HEIGHT,
          },
        }),
      ]),
    ]);

    renderWithProviders(<ProductMasonry cards={cards} />);

    const image = screen.getByRole('img', { name: /Gấu bông thêu tay/ });
    expect(image).toHaveAttribute('width', String(WIDTH));
    expect(image).toHaveAttribute('height', String(HEIGHT));
  });

  it('renders NO width or height when the API publishes none, rather than a guess', () => {
    const cards = flattenDiscoverPages([
      makePublicPage([
        makePublicProduct({
          slug: 'gau-bong-theu-tay',
          name: 'Gấu bông thêu tay',
          // The historical state: a deliverable image whose derivative stores no
          // dimensions. A fallback ratio here would reserve the wrong box and
          // shift twice instead of once.
          thumbnail: {
            role: 'THUMBNAIL',
            url: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
          },
        }),
      ]),
    ]);

    renderWithProviders(<ProductMasonry cards={cards} />);

    const image = screen.getByRole('img', { name: /Gấu bông thêu tay/ });
    expect(image).not.toHaveAttribute('width');
    expect(image).not.toHaveAttribute('height');
  });

  it('renders no dimensions when only one of the pair is published', () => {
    const cards = flattenDiscoverPages([
      makePublicPage([
        makePublicProduct({
          slug: 'gau-bong-theu-tay',
          name: 'Gấu bông thêu tay',
          thumbnail: {
            role: 'THUMBNAIL',
            url: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
            width: WIDTH,
          },
        }),
      ]),
    ]);

    renderWithProviders(<ProductMasonry cards={cards} />);

    const image = screen.getByRole('img', { name: /Gấu bông thêu tay/ });
    expect(image).not.toHaveAttribute('width');
    expect(image).not.toHaveAttribute('height');
  });
});

describe('Gallery feed intrinsic dimensions', () => {
  it('renders width and height from the API values', () => {
    const cards = flattenGalleryPages([
      makeGalleryPage([
        makeGalleryEntry({ title: 'Kỷ niệm được giữ lại', coverWidth: WIDTH, coverHeight: HEIGHT }),
      ]),
    ]);

    renderWithProviders(<GalleryMasonry cards={cards} />);

    const image = screen.getByRole('img', { name: /Kỷ niệm được giữ lại/ });
    expect(image).toHaveAttribute('width', String(WIDTH));
    expect(image).toHaveAttribute('height', String(HEIGHT));
  });

  it('renders NO width or height when the API publishes none, rather than a guess', () => {
    const cards = flattenGalleryPages([
      makeGalleryPage([makeGalleryEntry({ title: 'Kỷ niệm được giữ lại' })]),
    ]);

    renderWithProviders(<GalleryMasonry cards={cards} />);

    const image = screen.getByRole('img', { name: /Kỷ niệm được giữ lại/ });
    expect(image).not.toHaveAttribute('width');
    expect(image).not.toHaveAttribute('height');
  });
});
