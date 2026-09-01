/**
 * Category guidance (UI02 `214:587` / `224:890` / `226:1052`).
 *
 * The properties under test are the ones that make guidance truthful: one chip
 * per category the **database** currently publishes, labelled with the row's own
 * name, real links so the control works before hydration and with the browser's
 * back button, and an active state assistive technology can perceive without
 * colour.
 *
 * The inventory below is arbitrary fixture data (`APP12-C01-C1`). It is
 * deliberately not the four categories migration `0033` seeded: a test that
 * asserted those would make this file the place the taxonomy is declared, which
 * is the defect the correction removed.
 */
import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { DiscoverCategoryNav } from '../../src/features/product-discovery/components/discover-category-nav';
import type { DiscoverCategory } from '../../src/features/product-discovery/model/discover-categories';
import { DISCOVER_COPY } from '../../src/features/product-discovery/model/discover-copy';

const INVENTORY: readonly DiscoverCategory[] = [
  { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', isIndexable: true, displayOrder: 7 },
  { slug: 'tui-vai', name: 'Túi vải', isIndexable: false, displayOrder: 8 },
  { slug: 'ao-khoac', name: 'Áo khoác', isIndexable: true, displayOrder: 9 },
];

function nav() {
  return screen.getByRole('navigation', { name: DISCOVER_COPY.categoryNavLabel });
}

function linkTexts() {
  return within(nav())
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('Discover category navigation', () => {
  it('renders one chip per database row, labelled by the row name', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug={undefined} />);
    expect(linkTexts()).toEqual(['Tất cả', 'Mũ lưỡi trai', 'Túi vải', 'Áo khoác']);
  });

  it('grows and shrinks with the inventory, with no source change', () => {
    const { unmount } = renderWithProviders(
      <DiscoverCategoryNav categories={INVENTORY.slice(0, 1)} activeSlug={undefined} />,
    );
    expect(linkTexts()).toEqual(['Tất cả', 'Mũ lưỡi trai']);
    unmount();

    renderWithProviders(
      <DiscoverCategoryNav
        categories={[
          ...INVENTORY,
          { slug: 'danh-muc-moi', name: 'Danh mục mới', isIndexable: true, displayOrder: 99 },
        ]}
        activeSlug={undefined}
      />,
    );
    expect(linkTexts()).toContain('Danh mục mới');
  });

  it('maps each choice onto the locked URL form', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug={undefined} />);
    expect(
      within(nav())
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/kham-pha',
      '/kham-pha?category=mu-luoi-trai',
      '/kham-pha?category=tui-vai',
      '/kham-pha?category=ao-khoac',
    ]);
  });

  it('renders a non-indexable category, because Discover is not a sitemap', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug={undefined} />);
    expect(within(nav()).getByRole('link', { name: 'Túi vải' })).toHaveAttribute(
      'href',
      '/kham-pha?category=tui-vai',
    );
  });

  it('marks the selected category for assistive technology, not by colour alone', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug="tui-vai" />);
    const active = within(nav()).getByRole('link', { name: 'Túi vải' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('discover__chip--active');

    // Exactly one chip is current.
    const current = within(nav())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('marks "Tất cả" current on the unfiltered feed', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug={undefined} />);
    expect(within(nav()).getByRole('link', { name: 'Tất cả' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the unavailable notice, never a remembered list, when the inventory failed', () => {
    renderWithProviders(<DiscoverCategoryNav categories={undefined} activeSlug={undefined} />);

    expect(within(nav()).queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(DISCOVER_COPY.categoryUnavailable)).toBeInTheDocument();
    // Crucially: no historical taxonomy is substituted.
    for (const historical of ['Thú bông', 'Khăn', 'Quần áo', 'Khác']) {
      expect(screen.queryByText(historical)).not.toBeInTheDocument();
    }
  });

  it('renders just "Tất cả" for an empty inventory, which is a truthful answer', () => {
    renderWithProviders(<DiscoverCategoryNav categories={[]} activeSlug={undefined} />);
    expect(linkTexts()).toEqual(['Tất cả']);
  });

  it('renders none of UI02’s unsupported controls', () => {
    renderWithProviders(<DiscoverCategoryNav categories={INVENTORY} activeSlug={undefined} />);
    // The draft frames sketch style/theme/collection filters; the backend
    // supports none of them, so they are absent rather than inert.
    for (const draft of ['Phong cách', 'Chủ đề', 'Bộ sưu tập', 'Tối giản', 'Đám cưới', 'Thêm']) {
      expect(screen.queryByText(new RegExp(draft))).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
