import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';
import { STOREFRONT_SHELL_COPY } from '../../src/features/storefront-shell/model/storefront-shell-copy';

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
    const brandLinks = screen.getAllByRole('link', { name: STOREFRONT_SHELL_COPY.brand.homeLabel });
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
      // The four Wave-1 items plus the restored one, all still real links.
      expect(within(nav).queryAllByRole('link')).toHaveLength(5);
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('links every item it renders, and renders no item it cannot link', () => {
    const { container } = renderShell();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });

    // Four Wave-1 areas, in IA order, every one a real link on its canonical
    // route. `V01-UX-008` measured three of the five approved items dead;
    // `APP12-V02` §9 rebuilt the header from destinations that work, promoting
    // `Dịch vụ` and `Cửa hàng` — already-released routes that had been
    // reachable only from the footer.
    const links = within(nav).queryAllByRole('link');
    expect(links.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([
      ['/kham-pha', 'Khám phá'],
      ['/bo-suu-tap', 'Bộ sưu tập'],
      ['/dich-vu', 'Dịch vụ'],
      ['/cua-hang', 'Cửa hàng'],
    ]);

    // And nothing is drawn as unavailable. §9: a grey disabled item has no
    // place in primary navigation. `Studio` and `Nhật ký` are gone from the
    // model — neither ever had a route — and `Đặt thêu` is omitted while the
    // server refuses its address, rather than shown with a `Sắp ra mắt` tag.
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    for (const label of ['Studio', 'Nhật ký', 'Đặt thêu']) {
      expect(within(nav).queryByText(label)).toBeNull();
    }

    // Still no dead anchors and no invented routes anywhere in the shell.
    for (const anchor of container.querySelectorAll('a')) {
      const href = anchor.getAttribute('href');
      expect(href).not.toBe('#');
      expect(href).not.toBe('');
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

  it('renders no search control at all, real or presentational', () => {
    const { container } = renderShell();

    // The approved header composes a search bar and `APP1-S01A` shipped the
    // most honest thing available to it: a non-focusable glyph plus a
    // screen-reader note saying search was unavailable. On a released shop that
    // is still a search box the customer cannot search with, on every page
    // (`V01-UX-008`), beside a sentence whose subject is a missing capability
    // (`V01-UX-004`). §9 removes both.
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tìm kiếm/)).toBeNull();
  });

  it('exposes a mobile navigation trigger wired to the drawer, collapsed by default', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Mở menu điều hướng' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'storefront-mobile-drawer');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
