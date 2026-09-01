import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

function renderShell() {
  return renderWithProviders(
    <StorefrontShell>
      <h1>Trang mẫu</h1>
      <p>Nội dung trang.</p>
    </StorefrontShell>,
  );
}

describe('StorefrontShell — structure & landmarks', () => {
  it('wraps children exactly once inside a single <main> content slot', () => {
    renderShell();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    // The page heading and content render exactly once, inside <main>.
    const headings = screen.getAllByRole('heading', { level: 1, name: 'Trang mẫu' });
    expect(headings).toHaveLength(1);
    expect(within(mains[0] as HTMLElement).getByText('Nội dung trang.')).toBeInTheDocument();
  });

  it('exposes header, footer and navigation landmarks', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    // Header inline nav + drawer nav both carry distinct accessible names.
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });

  it('creates no page <h1> of its own (heading is page-owned)', () => {
    renderWithProviders(
      <StorefrontShell>
        <p>Không có tiêu đề.</p>
      </StorefrontShell>,
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('provides a skip link that targets the main content region', () => {
    renderShell();
    const skip = screen.getByRole('link', { name: 'Bỏ qua tới nội dung chính' });
    expect(skip).toHaveAttribute('href', '#main-content');
  });
});

describe('StorefrontShell — navigation & search boundaries', () => {
  it('links the brand to the canonical home route only', () => {
    renderShell();
    const brandLinks = screen.getAllByRole('link', { name: 'Xưởng Thêu — về trang chủ' });
    expect(brandLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of brandLinks) {
      expect(link).toHaveAttribute('href', '/');
    }
  });

  /**
   * The other half of the `APP12-G02` §9 suppression: releasing Wave 2 restores
   * the delivered `APP5-S01` link exactly as it was. Asserted so the suppression
   * cannot quietly become a permanent deletion of a navigation item.
   */
  it('restores the custom-request nav link once Wave 2 is released', () => {
    const key = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';
    const previous = process.env[key];
    process.env[key] = 'true';
    try {
      renderShell();
      const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
      const request = within(nav).getByRole('link', { name: 'Đặt thêu' });
      expect(request).toHaveAttribute('href', '/yeu-cau/moi');
      expect(within(nav).queryAllByRole('link')).toHaveLength(3);
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('links only the areas that are built and leaves the rest non-interactive', () => {
    const { container } = renderShell();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });

    // Two Wave-1 areas are real links on their canonical routes, in IA order:
    // Discover (APP2-S01, IMP-D038) and Collections (APP11-S02).
    const links = within(nav).queryAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName('Khám phá');
    expect(links[0]).toHaveAttribute('href', '/kham-pha');
    expect(links[1]).toHaveAccessibleName('Bộ sưu tập');
    expect(links[1]).toHaveAttribute('href', '/bo-suu-tap');

    // Every other IA label is flagged unavailable to assistive tech. Studio has
    // no landing page (APP3 built one per Product) and the approved APP11
    // Homepage deleted Journal outright, so neither gains an href. `Đặt thêu`
    // joins them **only while Wave 2 is withheld** (APP12-G02 §9): its route is
    // built and the server now refuses it, so offering the link would advertise
    // a deliberate 404. The release-aware half of that is asserted below.
    for (const label of ['Studio', 'Nhật ký', 'Đặt thêu']) {
      expect(within(nav).getByText(label).closest('[aria-disabled="true"]')).not.toBeNull();
    }

    // Still no dead anchors and no invented routes anywhere in the shell.
    for (const anchor of container.querySelectorAll('a')) {
      const href = anchor.getAttribute('href');
      expect(href).not.toBe('#');
      expect(href).not.toBe('');
      // `#main-content` is the skip link's in-page target, not a route.
      //
      // The set grew at `APP11-S05`: the shell now composes the footer
      // store-presentation block above the DS footer, and its four columns link
      // the three singular content routes and the four policies. The primary
      // navigation above is unchanged — S05 activated no header item, because no
      // existing IA label means Service and `Studio` may not be repurposed to
      // `/cua-hang`. What this assertion still guards is the property it always
      // did: every anchor the shell renders resolves to a delivered route.
      expect([
        '/',
        '/kham-pha',
        '/bo-suu-tap',
        '/yeu-cau/moi',
        '/dich-vu',
        '/cau-hoi-thuong-gap',
        '/cua-hang',
        '/chinh-sach/giao-hang',
        '/chinh-sach/thanh-toan',
        '/chinh-sach/doi-tra',
        '/chinh-sach/bao-mat',
        '#main-content',
      ]).toContain(href);
    }
  });

  it('renders a non-submitting, non-focusable search affordance (no fake control)', () => {
    const { container } = renderShell();
    // Not a real input/button/form: nothing focusable or submittable.
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    // The unavailable capability is announced accessibly instead.
    expect(screen.getByText('Tìm kiếm sẽ sớm ra mắt.')).toBeInTheDocument();
  });

  it('exposes a mobile navigation trigger wired to the drawer, collapsed by default', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Mở menu điều hướng' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'storefront-mobile-drawer');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
