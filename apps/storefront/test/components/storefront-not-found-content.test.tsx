import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import NotFound from '../../src/app/not-found';
import { StorefrontNotFound } from '../../src/features/storefront-not-found';

describe('StorefrontNotFound — content & recovery', () => {
  it('renders the decorative 404 code and the safe heading', () => {
    renderWithProviders(<StorefrontNotFound />);
    // 404 is present but decorative (aria-hidden), so it is not the accessible title.
    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Không tìm thấy trang');
  });

  it('renders a safe explanation with no technical detail or path echo', () => {
    const { container } = renderWithProviders(<StorefrontNotFound />);
    expect(screen.getByText(/Trang bạn tìm có thể đã được di chuyển/)).toBeInTheDocument();
    // No stack trace, exception, request id, status code, or filesystem path.
    expect(container.textContent ?? '').not.toMatch(
      /stack|trace|exception|request id|\/api\/|\/src\/|:\/\/|500|error:/i,
    );
    // The copy never claims the page was deleted.
    expect(container.textContent ?? '').not.toMatch(/đã xoá|đã xóa|bị xoá|bị xóa/i);
  });

  it('renders a primary recovery link to the canonical home route', () => {
    renderWithProviders(<StorefrontNotFound />);
    const primary = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(primary).toHaveAttribute('href', '/');
  });

  it('recovers to the Discover route now that the area exists', () => {
    const { container } = renderWithProviders(<StorefrontNotFound />);
    // APP2-S01 built `/kham-pha` (IMP-D038), so the secondary recovery is a real
    // link — and the "unavailable" affordance that stood in for it is gone.
    const secondary = screen.getByRole('link', { name: /Khám phá tác phẩm/ });
    expect(secondary).toHaveAttribute('href', '/kham-pha');
    expect(screen.queryByText(/chưa khả dụng/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sắp ra mắt')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();

    // Still no dead anchors and no invented routes.
    for (const anchor of container.querySelectorAll('a')) {
      expect(['/', '/kham-pha']).toContain(anchor.getAttribute('href'));
    }
  });

  it('recovery focus order is heading → primary → secondary', () => {
    const { container } = renderWithProviders(<StorefrontNotFound />);
    const order = Array.from(
      container.querySelectorAll(
        'h1, .storefront-not-found__action--primary, .storefront-not-found__action--secondary',
      ),
    ).map((el) => el.className);
    expect(order[0]).toContain('storefront-not-found__title');
    expect(order[1]).toContain('storefront-not-found__action--primary');
    expect(order[2]).toContain('storefront-not-found__action--secondary');
  });
});

describe('not-found route file — thin, owns h1, no shell of its own', () => {
  it('renders the feature and no header/footer/main/nav of its own', () => {
    const { container } = renderWithProviders(<NotFound />);
    // The page owns exactly one h1 and renders none of the shell landmarks itself.
    expect(within(container).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
  });
});
