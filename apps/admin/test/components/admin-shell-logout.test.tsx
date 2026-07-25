import {
  createNavigationMock as mockCreateNavigationMock,
  createTestQueryClient,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { AdminShell, AdminHomePlaceholder } from '../../src/features/admin-shell';
import { submitStaffLogout } from '../../src/features/admin-shell/services/staff-logout.service';
import { STAFF_SELF_QUERY_KEY } from '../../src/features/admin-shell/model/session-expiry';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));

const mockLogout = submitStaffLogout as jest.MockedFunction<typeof submitStaffLogout>;
const router = useRouter() as unknown as { replace: jest.Mock; refresh: jest.Mock };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderShell() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(STAFF_SELF_QUERY_KEY, ADMIN_STAFF_FIXTURE);
  // Navigation is mocked, so the shell never unmounts; the mounted query
  // observer would re-seed `initialData` right after a clear. Spy on the clear
  // itself to assert intent — in the real app the redirect unmounts the shell.
  const removeQueries = jest.spyOn(queryClient, 'removeQueries');
  const result = renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <AdminHomePlaceholder />
    </AdminShell>,
    { queryClient },
  );
  return { ...result, queryClient, removeQueries };
}

function logoutButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Đăng xuất' });
}

beforeEach(() => {
  mockLogout.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

describe('AdminShell — logout', () => {
  it('calls the logout operation once and returns to login on 204', async () => {
    mockLogout.mockResolvedValue(undefined);
    const user = createUser();
    const { removeQueries } = renderShell();

    await user.click(logoutButton());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: STAFF_SELF_QUERY_KEY });
  });

  it('shows a pending state and blocks duplicate logout while in flight', async () => {
    const pending = deferred<void>();
    mockLogout.mockReturnValue(pending.promise);
    const user = createUser();
    renderShell();

    await user.click(logoutButton());
    const pendingButton = await screen.findByRole('button', { name: 'Đang đăng xuất…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');

    await user.click(pendingButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  it('treats a mapped-away session (service resolves) as logged out', async () => {
    // The service maps a 401 to success; the hook cannot tell it from a 204.
    mockLogout.mockResolvedValue(undefined);
    const user = createUser();
    const { removeQueries } = renderShell();

    await user.click(logoutButton());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: STAFF_SELF_QUERY_KEY });
  });

  it('keeps the shell and offers a safe retry on a dependency failure', async () => {
    mockLogout.mockRejectedValue(new Error('STAFF_LOGOUT_FAILED'));
    const user = createUser();
    const { queryClient } = renderShell();

    await user.click(logoutButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hiện chưa thể đăng xuất. Vui lòng thử lại.');
    // No raw error surfaced.
    expect(alert).not.toHaveTextContent('STAFF_LOGOUT_FAILED');
    // Shell stays: no navigation, identity cache intact, no auto retry.
    expect(router.replace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(STAFF_SELF_QUERY_KEY)).toEqual(ADMIN_STAFF_FIXTURE);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('main')).toBeInTheDocument();

    // Retry re-invokes the operation exactly once more (manual, not automatic).
    mockLogout.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });
});
