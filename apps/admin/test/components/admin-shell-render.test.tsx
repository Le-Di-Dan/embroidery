import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';

import { AdminShell, AdminHomePlaceholder } from '../../src/features/admin-shell';
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
      <AdminHomePlaceholder />
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

  it('renders the standalone placeholder with only forward-looking copy', () => {
    renderWithProviders(<AdminHomePlaceholder />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Quyền truy cập quản trị đã sẵn sàng' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
