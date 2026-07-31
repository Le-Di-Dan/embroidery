/**
 * The product list inside the authenticated Admin shell: one canonical route,
 * one active navigation destination, one page heading — and no link to a screen
 * `APP2-A03`/`APP2-A04` have not built yet.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';
import { adminProductList } from '@embroidery/api-client';

import { AdminShell } from '../../src/features/admin-shell';
import { ProductListScreen } from '../../src/features/products/components/product-list-screen';
import { ADMIN_PRODUCTS_ROUTE } from '../../src/features/products/model/product-route';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';
import { makeProduct, makeProductPage, productEnvelope } from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products').module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductList: jest.fn(),
}));

const listMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

function renderProductsRoute() {
  listMock.mockResolvedValue(
    productEnvelope(makeProductPage([makeProduct({ name: 'Gấu bông thêu tay' })])),
  );

  return renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <ProductListScreen />
    </AdminShell>,
  );
}

describe('Admin products route and navigation', () => {
  it('exposes exactly one canonical route constant', () => {
    expect(ADMIN_PRODUCTS_ROUTE).toBe('/products');
  });

  it('marks the product destination as the current location, not a link', () => {
    renderProductsRoute();

    const rail = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
    const current = rail.getByText(PRODUCT_COPY.page.title);
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('A');
    expect(rail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/');
  });

  it('renders a single page heading inside the shell main region', async () => {
    renderProductsRoute();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(PRODUCT_COPY.page.title);
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBe(headings[0]);
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('never renders an alias route, and addresses products by id rather than slug', async () => {
    const { container } = renderProductsRoute();
    await screen.findByRole('table');

    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).not.toContain('/admin/products');
    expect(hrefs).not.toContain('/catalog');
    expect(hrefs).not.toContain('/san-pham');

    // `APP2-A03` owns these two routes and they now exist.
    expect(hrefs).toContain('/products/new');

    // Every product link is the B02 UUID, never the public slug: the slug is a
    // storefront address and would break as an Admin identity the moment slugs
    // were ever allowed to change.
    const productLinks = hrefs.filter(
      (href) => href?.startsWith('/products/') && href !== '/products/new',
    );
    expect(productLinks.length).toBeGreaterThan(0);
    for (const href of productLinks) {
      expect(href).toMatch(/^\/products\/[0-9a-fA-F-]{36}$/);
    }
  });
});
