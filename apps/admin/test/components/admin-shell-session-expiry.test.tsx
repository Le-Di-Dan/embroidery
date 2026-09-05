import {
  createNavigationMock as mockCreateNavigationMock,
  createTestQueryClient,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { AdminShell, AdminHomeLaunchpad } from '../../src/features/admin-shell';
import { fetchCurrentStaff } from '../../src/features/admin-shell/services/staff-self.service';
import { STAFF_SELF_QUERY_KEY } from '../../src/features/admin-shell/model/session-expiry';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));

const mockFetch = fetchCurrentStaff as jest.MockedFunction<typeof fetchCurrentStaff>;
const router = useRouter() as unknown as { replace: jest.Mock; refresh: jest.Mock };

function renderShell() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(STAFF_SELF_QUERY_KEY, ADMIN_STAFF_FIXTURE);
  const removeQueries = jest.spyOn(queryClient, 'removeQueries');
  const result = renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <AdminHomeLaunchpad />
    </AdminShell>,
    { queryClient },
  );
  return { ...result, queryClient, removeQueries };
}

async function forceRefetch(queryClient: ReturnType<typeof createTestQueryClient>): Promise<void> {
  await queryClient.refetchQueries({ queryKey: STAFF_SELF_QUERY_KEY });
}

beforeEach(() => {
  mockFetch.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

describe('AdminShell — client session expiry', () => {
  it('shows no expired modal on the initial authenticated render', () => {
    renderShell();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the expired modal only after a later 401, keeping the shell visible', async () => {
    const { queryClient, container } = renderShell();
    mockFetch.mockRejectedValue(makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' }));

    await forceRefetch(queryClient);

    const modal = await screen.findByRole('alertdialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAccessibleName('Phiên đăng nhập đã hết hạn');
    // The already-authenticated shell stays recognizable beneath the scrim.
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(container.querySelector('.admin-shell__scrim--expiry')).not.toBeNull();
    // Focus moved into the modal, onto its single action.
    const action = screen.getByRole('button', { name: 'Đăng nhập lại' });
    expect(action).toHaveFocus();
  });

  it('traps focus and cannot be dismissed by Escape or the backdrop', async () => {
    const { queryClient, container } = renderShell();
    mockFetch.mockRejectedValue(makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' }));
    await forceRefetch(queryClient);
    await screen.findByRole('alertdialog');
    const user = createUser();
    const action = screen.getByRole('button', { name: 'Đăng nhập lại' });

    await user.keyboard('{Tab}');
    expect(action).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const scrim = container.querySelector('.admin-shell__scrim--expiry');
    if (scrim !== null) {
      await user.click(scrim);
    }
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not show the expired modal for a transient dependency failure', async () => {
    const { queryClient } = renderShell();
    mockFetch.mockRejectedValue(makeNetworkError());

    await forceRefetch(queryClient);

    await waitFor(() =>
      expect(screen.getByText('Mất kết nối tạm thời. Đang thử kết nối lại…')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('returns to login when the re-login action is used, clearing staff state', async () => {
    const { queryClient, removeQueries } = renderShell();
    mockFetch.mockRejectedValue(makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' }));
    await forceRefetch(queryClient);
    await screen.findByRole('alertdialog');
    const user = createUser();

    await user.click(screen.getByRole('button', { name: 'Đăng nhập lại' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: STAFF_SELF_QUERY_KEY });
  });

  it('does not poll — a single refetch produced the expiry, with no keep-alive', async () => {
    const { queryClient } = renderShell();
    mockFetch.mockRejectedValue(makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' }));
    await forceRefetch(queryClient);
    await screen.findByRole('alertdialog');

    // No interval/renew: the only call is the one refetch we forced.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
