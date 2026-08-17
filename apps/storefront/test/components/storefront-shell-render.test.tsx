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

  it('links only the areas that are built and leaves the rest non-interactive', () => {
    const { container } = renderShell();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });

    // Two built areas: Discover (APP2-S01, IMP-D038) and the custom request
    // (APP5-S01). Each is a real link on its canonical route, and nothing else is.
    const links = within(nav).queryAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName('Khám phá');
    expect(links[0]).toHaveAttribute('href', '/kham-pha');
    expect(links[1]).toHaveAccessibleName('Đặt thêu');
    expect(links[1]).toHaveAttribute('href', '/yeu-cau/moi');

    // Every other IA label is still flagged unavailable to assistive tech.
    for (const label of ['Bộ sưu tập', 'Studio', 'Nhật ký']) {
      expect(within(nav).getByText(label).closest('[aria-disabled="true"]')).not.toBeNull();
    }

    // Still no dead anchors and no invented routes anywhere in the shell.
    for (const anchor of container.querySelectorAll('a')) {
      const href = anchor.getAttribute('href');
      expect(href).not.toBe('#');
      expect(href).not.toBe('');
      // `#main-content` is the skip link's in-page target, not a route.
      expect(['/', '/kham-pha', '/yeu-cau/moi', '#main-content']).toContain(href);
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
