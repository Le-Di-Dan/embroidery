/**
 * `Tiếp tục khám phá` — the continuation CTA's destination resolution
 * (`FU-APP11-S04-C1-01`, repaired at `APP11-S05`, corrected at `APP12-C01-C1`).
 *
 * The defect this covers was live: `/san-pham/ao-thun-cotton` carries
 * `category.slug = ao-thun`, which was not in the closed Discover enum, and the
 * category CTA linked to `/kham-pha?category=ao-thun` — a 404. The page's own
 * invitation to keep browsing was the one link on it that could not be followed.
 *
 * `S05` contained that by narrowing against the four compiled slugs. That is no
 * longer the rule, because the cause is gone: the category set is the
 * `categories` table, Discover lists from it, and a Product is publicly visible
 * only when its category is published and not archived. Any category on a public
 * Product response is therefore addressable, and the remaining guard is on slug
 * **syntax** — a URL rule this app owns.
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

describe('any database-backed category filters Discover', () => {
  /**
   * Arbitrary valid slugs — fixture data, not a taxonomy. `ao-thun` is the live
   * `ao-thun-cotton` fixture's value: the exact case the old rule sent to
   * unfiltered Discover, and now an ordinary filtered link.
   */
  it.each(['ao-thun', 'mu-luoi-trai', 'tui-vai', 'danh-muc-2026'])(
    '%s links to its own Discover category state, with no membership check',
    (slug) => {
      renderWithProviders(<DetailContinueDiscover categoryName="Danh mục" categorySlug={slug} />);

      expect(categoryLink()).toHaveAttribute('href', `/kham-pha?category=${slug}`);
    },
  );
});

describe('a slug that cannot become a URL falls back to unfiltered Discover', () => {
  it.each([
    ['the empty string', ''],
    ['a slug in the wrong case', 'THU-BONG'],
    ['a slug with a space', 'thu bong'],
    ['a slug with a query appended', 'khan?x=1'],
    ['an underscored slug', 'ao_thun'],
    ['a leading hyphen', '-ao'],
  ])('%s links to /kham-pha', (_label, slug) => {
    renderWithProviders(<DetailContinueDiscover categoryName="Áo thun" categorySlug={slug} />);

    expect(categoryLink()).toHaveAttribute('href', '/kham-pha');
    expect(categoryLink()).not.toHaveAttribute('href', expect.stringContaining('?category='));
  });
});

describe('the CTA is never removed by a data defect', () => {
  it('keeps both links, and keeps naming the category, at either branch', () => {
    renderWithProviders(<DetailContinueDiscover categoryName="Áo thun" categorySlug="thu bong" />);

    const [everything, category] = screen.getAllByRole('link');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(everything).toHaveAttribute('href', '/kham-pha');
    // The Product *is* in the category; only the filtered feed is not an address.
    expect(category).toHaveTextContent('Áo thun');
  });

  it('renders the same two-link composition for a well-formed category', () => {
    renderWithProviders(
      <DetailContinueDiscover categoryName="Mũ lưỡi trai" categorySlug="mu-luoi-trai" />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
