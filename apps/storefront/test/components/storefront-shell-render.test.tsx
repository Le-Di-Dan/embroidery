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

  it('renders primary nav items as non-interactive, never as links or dead anchors', () => {
    const { container } = renderShell();
    // No nav item is a link (routes are unbuilt) and there are no dead anchors.
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).not.toBe('#');
    }
    // Approved IA labels are present but flagged unavailable to assistive tech.
    const item = within(nav).getByText('Khám phá').closest('[aria-disabled="true"]');
    expect(item).not.toBeNull();
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
