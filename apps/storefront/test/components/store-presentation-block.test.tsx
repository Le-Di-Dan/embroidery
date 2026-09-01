/**
 * The footer store-presentation block (`APP11-S05`, `FU-APP10-D01-05`).
 *
 * Design authority: `872:1029` / `888:1006` / `888:1058` and the responsive
 * authority `889:1030`.
 *
 * Layout at three widths is a live-browser assertion — jsdom applies no
 * stylesheet, so a grid track count cannot be observed here. What *can* be
 * proven here is everything the CSS is not allowed to change: the four columns,
 * their source order, the exact policy grouping, and the two things that must
 * never appear.
 */
import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorePresentationBlock } from '../../src/features/store-presentation';
import { withCustomEmbroideryRelease } from '../support/release-flag';

describe('composition', () => {
  it('is a named region, not a second footer landmark', () => {
    renderWithProviders(<StorePresentationBlock />);

    // The shell's own <footer> owns `contentinfo`; a second would leave a
    // screen-reader user choosing between two things both called "footer".
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.getByRole('region', { name: 'Thông tin cửa hàng' })).toBeInTheDocument();
  });

  it('renders the four approved columns in source order', () => {
    renderWithProviders(<StorePresentationBlock />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Nét Thêu',
      'Liên hệ',
      'Dịch vụ & hỗ trợ',
      'Chính sách',
    ]);
  });

  it('sets no CSS `order`, so keyboard order can never diverge from visual order', () => {
    const { container } = renderWithProviders(<StorePresentationBlock />);

    for (const column of container.querySelectorAll('.store-presentation__column')) {
      expect(column.getAttribute('style')).toBeNull();
    }
  });
});

describe('the policy column', () => {
  it('carries all four policies, in canonical order, in one column', () => {
    renderWithProviders(<StorePresentationBlock />);

    const column = screen.getByRole('heading', { level: 2, name: 'Chính sách' })
      .parentElement as HTMLElement;

    expect(
      within(column)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/chinh-sach/giao-hang',
      '/chinh-sach/thanh-toan',
      '/chinh-sach/doi-tra',
      '/chinh-sach/bao-mat',
    ]);
  });

  it('splits no policy link into the service column', () => {
    renderWithProviders(<StorePresentationBlock />);

    const column = screen.getByRole('heading', { level: 2, name: 'Dịch vụ & hỗ trợ' })
      .parentElement as HTMLElement;

    expect(
      within(column)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/dich-vu', '/cau-hoi-thuong-gap', '/bo-suu-tap']);
  });
});

describe('the floating dock stays separate', () => {
  it('renders no Zalo or Messenger action, and no external link at all', () => {
    renderWithProviders(<StorePresentationBlock />);

    expect(screen.queryByText(/Zalo/i)).toBeNull();
    expect(screen.queryByText(/Messenger/i)).toBeNull();

    for (const link of screen.getAllByRole('link')) {
      // Every footer link is internal; the dock owns the two external URLs.
      expect(link.getAttribute('href')).toMatch(/^\//);
      expect(link).not.toHaveAttribute('target');
    }
  });
});

describe('store facts degrade truthfully', () => {
  it('publishes no address, hours, phone or e-mail while none is canonical', () => {
    const { container } = renderWithProviders(<StorePresentationBlock />);

    expect(container.querySelectorAll('.store-presentation__fact')).toHaveLength(0);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('renders no placeholder in place of an absent fact', () => {
    const { container } = renderWithProviders(<StorePresentationBlock />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/TBD|example\.|\[[^\]]*chưa có[^\]]*\]/i);
    expect(text).not.toMatch(/(?:\+84|0)\d[\d\s.-]{7,}/);
    expect(text).not.toMatch(/[\w.-]+@[\w.-]+\.\w{2,}/);
  });

  /**
   * `Ghé xưởng` is Wave-1 and unconditional. The contact column's request action
   * is Wave-2, so `APP12-G02-C1` makes it follow the release: the block renders
   * on every page, which made it the widest-reaching offer of a route the server
   * refuses. Both states are asserted, and the reversibility of the second is
   * what keeps the suppression from becoming a deletion.
   */
  it('still routes the visitor somewhere real, in both release states', () => {
    withCustomEmbroideryRelease(false, () => {
      renderWithProviders(<StorePresentationBlock />);
      expect(screen.getByRole('link', { name: 'Ghé xưởng' })).toHaveAttribute('href', '/cua-hang');
      expect(screen.queryByRole('link', { name: 'Gửi yêu cầu thêu' })).toBeNull();
    });

    withCustomEmbroideryRelease(true, () => {
      renderWithProviders(<StorePresentationBlock />);
      expect(screen.getAllByRole('link', { name: 'Ghé xưởng' })[0]).toHaveAttribute(
        'href',
        '/cua-hang',
      );
      expect(screen.getByRole('link', { name: 'Gửi yêu cầu thêu' })).toHaveAttribute(
        'href',
        '/yeu-cau/moi',
      );
    });
  });
});
