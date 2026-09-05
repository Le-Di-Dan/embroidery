import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';

import { AdminShell, AdminHomeLaunchpad } from '../../src/features/admin-shell';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));

function renderShell() {
  return renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <AdminHomeLaunchpad />
    </AdminShell>,
  );
}

describe('AdminShell — authenticated render', () => {
  it('renders the semantic shell landmarks', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });

  it('renders the exact display name and email with the static actor label', () => {
    renderShell();
    const banner = within(screen.getByRole('banner'));
    expect(banner.getByText('Quản trị Xưởng')).toBeInTheDocument();
    expect(banner.getByText('admin@example.test')).toBeInTheDocument();
    expect(banner.getByText('Quản trị viên')).toBeInTheDocument();
  });

  it('preserves the full identity value for assistive tech when truncated', () => {
    renderShell();
    expect(screen.getByText('Quản trị Xưởng')).toHaveAttribute('title', 'Quản trị Xưởng');
    expect(screen.getByText('admin@example.test')).toHaveAttribute('title', 'admin@example.test');
  });

  it('never renders the internal id or any role/permission/session field', () => {
    renderShell();
    expect(screen.queryByText(/staff-fixture-id-0001/)).not.toBeInTheDocument();
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session token/i)).not.toBeInTheDocument();
  });

  it('renders a single page-level heading and no fake business features', () => {
    renderShell();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(
      screen.queryByText(/đơn hàng đang chờ|doanh thu|thống kê|biểu đồ/i),
    ).not.toBeInTheDocument();
  });

  it('shows the current location as static text, not a link', () => {
    renderShell();
    const current = screen.getByText('Tổng quan');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('A');
  });

  it('lands the operator on the destinations that exist, not on an apology', () => {
    // `V01-UX-015`: this route used to render a placeholder saying products,
    // orders, designs and requests "sẽ xuất hiện trong các giai đoạn tiếp
    // theo" — on a product where all of them had shipped and were two clicks
    // away. `APP12-V02` §19 replaced it with a launchpad.
    renderWithProviders(<AdminHomeLaunchpad />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bảng điều hành');

    const targets = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(targets).toEqual([
      '/orders',
      '/products',
      '/categories',
      '/gallery',
      '/assets',
      '/support/customer-access',
    ]);

    // No Wave-2 queue: those have no subject that can exist while the custom
    // capability is withheld, and offering one would be the same broken promise
    // the placeholder made.
    for (const withheld of ['/requests', '/san-xuat', '/design-templates']) {
      expect(targets).not.toContain(withheld);
    }

    // And no count anywhere: §19 forbids new dashboard APIs and counters, and a
    // stale number is worse than none because the operator plans around it.
    expect(screen.queryAllByText(/[0-9]/u)).toEqual([]);
  });
});
