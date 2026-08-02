/**
 * Category guidance (UI02 `214:587` / `224:890` / `226:1052`).
 *
 * The properties under test are the ones that make guidance truthful: only the
 * four categories the backend actually filters by, real links so the control
 * works before hydration and with the browser's back button, and an active state
 * that assistive technology can perceive without colour.
 */
import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { DiscoverCategoryNav } from '../../src/features/product-discovery/components/discover-category-nav';
import { DISCOVER_COPY } from '../../src/features/product-discovery/model/discover-copy';

function nav() {
  return screen.getByRole('navigation', { name: DISCOVER_COPY.categoryNavLabel });
}

describe('Discover category navigation', () => {
  it('offers exactly the five truthful choices, in contract order', () => {
    renderWithProviders(<DiscoverCategoryNav activeSlug={undefined} />);
    expect(
      within(nav())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tất cả', 'Thú bông', 'Khăn', 'Quần áo', 'Khác']);
  });

  it('maps each choice onto the locked URL form', () => {
    renderWithProviders(<DiscoverCategoryNav activeSlug={undefined} />);
    const hrefs = within(nav())
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/kham-pha',
      '/kham-pha?category=thu-bong',
      '/kham-pha?category=khan',
      '/kham-pha?category=quan-ao',
      '/kham-pha?category=khac',
    ]);
  });

  it('marks the selected category for assistive technology, not by colour alone', () => {
    renderWithProviders(<DiscoverCategoryNav activeSlug="khan" />);
    const active = within(nav()).getByRole('link', { name: 'Khăn' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('discover__chip--active');

    // Exactly one chip is current.
    const current = within(nav())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('marks "Tất cả" current on the unfiltered feed', () => {
    renderWithProviders(<DiscoverCategoryNav activeSlug={undefined} />);
    expect(within(nav()).getByRole('link', { name: 'Tất cả' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renders none of UI02’s unsupported controls', () => {
    renderWithProviders(<DiscoverCategoryNav activeSlug={undefined} />);
    // The draft frames sketch style/theme/collection filters; APP2-B04 supports
    // none of them, so they are absent rather than inert.
    for (const draft of ['Phong cách', 'Chủ đề', 'Bộ sưu tập', 'Tối giản', 'Đám cưới', 'Thêm']) {
      expect(screen.queryByText(new RegExp(draft))).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
