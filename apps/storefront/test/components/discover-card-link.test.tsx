import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { ProductMasonry } from '../../src/features/product-discovery/components/product-masonry';
import { flattenDiscoverPages } from '../../src/features/product-discovery/model/discover-feed';
import {
  makePublicPage,
  makePublicProduct,
  makePublicProductWithoutThumbnail,
} from '../support/discover-fixture';

/**
 * The `APP2-S02` card handoff.
 *
 * `APP2-S01` shipped the card as a deliberately non-interactive `<article>`
 * because no detail route existed. This proves the upgrade did exactly one
 * thing — made the card a link — and left the masonry architecture, the visible
 * content and the source order precisely as they were.
 */

const CARDS = flattenDiscoverPages([
  makePublicPage([
    makePublicProduct({ slug: 'gau-bong-theu-tay', name: 'Gấu bông thêu tay' }),
    makePublicProduct({
      slug: 'khan-tay-hoa-sen',
      name: 'Khăn tay hoa sen',
      category: { slug: 'khan', name: 'Khăn' },
    }),
    makePublicProductWithoutThumbnail({ slug: 'ao-theu-cuc', name: 'Áo thêu cúc' }),
  ]),
]);

describe('Discover card → Product Detail', () => {
  it('makes each card exactly one link to the canonical detail route', () => {
    renderWithProviders(<ProductMasonry cards={CARDS} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/san-pham/gau-bong-theu-tay');
    expect(links[1]).toHaveAttribute('href', '/san-pham/khan-tay-hoa-sen');
    expect(links[2]).toHaveAttribute('href', '/san-pham/ao-theu-cuc');
  });

  it('nests no second interactive control inside a card', () => {
    renderWithProviders(<ProductMasonry cards={CARDS} />);

    for (const link of screen.getAllByRole('link')) {
      expect(within(link).queryByRole('button')).toBeNull();
      expect(within(link).queryByRole('link')).toBeNull();
    }
  });

  it('keeps the whole card inside the link, so name and image share one hit area', () => {
    renderWithProviders(<ProductMasonry cards={CARDS} />);
    const first = screen.getAllByRole('link')[0] as HTMLElement;

    expect(within(first).getByRole('heading', { name: 'Gấu bông thêu tay' })).toBeInTheDocument();
    expect(within(first).getByText('Thú bông')).toBeInTheDocument();
    expect(within(first).getByAltText(/Gấu bông thêu tay/)).toBeInTheDocument();
  });

  it('leaves the masonry architecture untouched', () => {
    const { container } = renderWithProviders(<ProductMasonry cards={CARDS} />);

    expect(container.querySelector('.discover__masonry')).not.toBeNull();
    expect(container.querySelectorAll('.discover__masonry-item')).toHaveLength(3);
    expect(container.querySelectorAll('.discover__card')).toHaveLength(3);
    // One flat list: the columns are a CSS concern, so the DOM must not be
    // sliced into per-column subtrees.
    expect(container.querySelectorAll('ul')).toHaveLength(1);
  });

  it('preserves source order exactly as the server returned it', () => {
    renderWithProviders(<ProductMasonry cards={CARDS} />);

    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Gấu bông thêu tay',
      'Khăn tay hoa sen',
      'Áo thêu cúc',
    ]);
  });

  it('still shows no price, stock or "xem chi tiết" affordance', () => {
    const { container } = renderWithProviders(<ProductMasonry cards={CARDS} />);

    expect(container.textContent).not.toContain('450000');
    expect(container.textContent).not.toContain('VND');
    expect(container.textContent?.toLowerCase()).not.toContain('xem chi tiết');
  });

  it('links a product with no thumbnail just the same', () => {
    renderWithProviders(<ProductMasonry cards={CARDS} />);
    const third = screen.getAllByRole('link')[2] as HTMLElement;

    expect(within(third).getByRole('img', { name: /Chưa có ảnh/ })).toBeInTheDocument();
    expect(third).toHaveAttribute('href', '/san-pham/ao-theu-cuc');
  });
});
