/**
 * `Tiếp tục khám phá` — the continuation CTA's destination resolution
 * (`FU-APP11-S04-C1-01`, repaired at `APP11-S05`).
 *
 * The defect this covers was live: `/san-pham/ao-thun-cotton` carries
 * `category.slug = ao-thun`, which is not in the closed Discover enum, and the
 * category CTA linked to `/kham-pha?category=ao-thun` — a 404. The page's own
 * invitation to keep browsing was the one link on it that could not be followed.
 *
 * These assertions are about the *seam*, not the composition: the CTA still has
 * two links with the same labels at both branches, and only where the second one
 * points changes.
 */
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { DetailContinueDiscover } from '../../src/features/product-detail/components/detail-continue-discover';

function categoryLink() {
  // The second of the two links: "everything" first, then this category.
  return screen.getAllByRole('link')[1];
}

describe('a canonical category still filters Discover', () => {
  it.each(['thu-bong', 'khan', 'quan-ao', 'khac'])(
    '%s links to its own Discover category state',
    (slug) => {
      renderWithProviders(<DetailContinueDiscover categoryName="Danh mục" categorySlug={slug} />);

      expect(categoryLink()).toHaveAttribute('href', `/kham-pha?category=${slug}`);
    },
  );
});

describe('a non-canonical category falls back to unfiltered Discover', () => {
  /**
   * `ao-thun` is the live `ao-thun-cotton` fixture's value and the reason this
   * repair exists. The others are the shapes a contract drift would take next.
   */
  it.each([
    ['the live ao-thun-cotton value', 'ao-thun'],
    ['an unknown slug', 'khong-ton-tai'],
    ['the empty string', ''],
    ['a canonical slug in the wrong case', 'THU-BONG'],
    ['a slug with a query appended', 'khan?x=1'],
  ])('%s links to /kham-pha', (_label, slug) => {
    renderWithProviders(<DetailContinueDiscover categoryName="Áo thun" categorySlug={slug} />);

    expect(categoryLink()).toHaveAttribute('href', '/kham-pha');
    expect(categoryLink()).not.toHaveAttribute('href', expect.stringContaining('?category='));
  });
});

describe('the CTA is never removed by a data defect', () => {
  it('keeps both links, and keeps naming the category, at either branch', () => {
    renderWithProviders(<DetailContinueDiscover categoryName="Áo thun" categorySlug="ao-thun" />);

    const [everything, category] = screen.getAllByRole('link');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(everything).toHaveAttribute('href', '/kham-pha');
    // The Product *is* in the category; only the filtered feed is not an address.
    expect(category).toHaveTextContent('Áo thun');
  });

  it('renders the same two-link composition for a canonical category', () => {
    renderWithProviders(<DetailContinueDiscover categoryName="Thú bông" categorySlug="thu-bong" />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
