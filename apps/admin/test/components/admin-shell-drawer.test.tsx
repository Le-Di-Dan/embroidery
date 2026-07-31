import {
  createNavigationMock as mockCreateNavigationMock,
  createTestQueryClient,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';

import { AdminShell, AdminHomePlaceholder } from '../../src/features/admin-shell';
import { STAFF_SELF_QUERY_KEY } from '../../src/features/admin-shell/model/session-expiry';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));

function renderShell() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(STAFF_SELF_QUERY_KEY, ADMIN_STAFF_FIXTURE);
  return renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <AdminHomePlaceholder />
    </AdminShell>,
    { queryClient },
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Mở menu điều hướng' });
}

describe('AdminShell — mobile navigation drawer', () => {
  it('opens the drawer and moves focus inside, reporting expanded state', async () => {
    const user = createUser();
    renderShell();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger());

    const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    const close = within(dialog).getByRole('button', { name: 'Đóng menu điều hướng' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('cycles focus within the drawer on Tab and Shift+Tab', async () => {
    const user = createUser();
    renderShell();
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });
    const close = within(dialog).getByRole('button', { name: 'Đóng menu điều hướng' });
    const logout = within(dialog).getByRole('button', { name: 'Đăng xuất' });
    // The drawer now also carries the real navigation destinations, so the
    // trap cycles through the links between the two buttons.
    const assets = within(dialog).getByRole('link', { name: 'Tài sản hình ảnh' });
    const products = within(dialog).getByRole('link', { name: 'Sản phẩm' });

    expect(close).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(assets).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(products).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(logout).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus(); // wraps forward
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(logout).toHaveFocus(); // wraps backward
  });

  it('closes on the close button and restores focus to the trigger', async () => {
    const user = createUser();
    renderShell();
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });

    await user.click(within(dialog).getByRole('button', { name: 'Đóng menu điều hướng' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape', async () => {
    const user = createUser();
    renderShell();
    await user.click(trigger());
    expect(screen.getByRole('dialog', { name: 'Điều hướng' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('closes on a backdrop click', async () => {
    const user = createUser();
    const { container } = renderShell();
    await user.click(trigger());
    const scrim = container.querySelector('.admin-shell__scrim--drawer');
    expect(scrim).not.toBeNull();

    await user.click(scrim as Element);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cleans up the scroll lock and listeners so reopening still works', async () => {
    const user = createUser();
    renderShell();

    await user.click(trigger());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');

    // A stray Escape after close is a no-op (listener was removed).
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Reopening re-establishes focus + scroll lock.
    await user.click(trigger());
    expect(screen.getByRole('dialog', { name: 'Điều hướng' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });
});
