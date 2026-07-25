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

  it('renders the secondary action as clearly unavailable, never a link or dead anchor', () => {
    const { container } = renderWithProviders(<StorefrontNotFound />);
    // The discovery area is not built: no second link, no dead anchor, no invented route.
    expect(screen.queryByRole('link', { name: /Khám phá tác phẩm/ })).not.toBeInTheDocument();
    const secondary = screen.getByText('Khám phá tác phẩm').closest('[aria-disabled="true"]');
    expect(secondary).not.toBeNull();
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).not.toBe('#');
    }
    // The unavailable state is announced to assistive tech.
    expect(screen.getByText('Khám phá tác phẩm — chưa khả dụng.')).toBeInTheDocument();
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
