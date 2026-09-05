import {
  createNavigationMock as mockCreateNavigationMock,
  createTestQueryClient,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';

import { AdminShell, AdminHomeLaunchpad } from '../../src/features/admin-shell';
import { fetchCurrentStaff } from '../../src/features/admin-shell/services/staff-self.service';
import { STAFF_SELF_QUERY_KEY } from '../../src/features/admin-shell/model/session-expiry';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));

const mockFetchCurrentStaff = fetchCurrentStaff as jest.MockedFunction<typeof fetchCurrentStaff>;

beforeEach(() => {
  mockFetchCurrentStaff.mockReset();
});

describe('AdminShell — initial staff hydration', () => {
  it('seeds the client cache from the server result and does not refetch on mount', async () => {
    const queryClient = createTestQueryClient();
    mockFetchCurrentStaff.mockResolvedValue(ADMIN_STAFF_FIXTURE);

    renderWithProviders(
      <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
        <AdminHomeLaunchpad />
      </AdminShell>,
      { queryClient },
    );

    // The layout already performed the one authoritative GET /api/staff/me;
    // the client must not duplicate it immediately after hydration.
    expect(mockFetchCurrentStaff).not.toHaveBeenCalled();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();

    // Give any (unwanted) microtask-scheduled fetch a chance to fire.
    await waitFor(() => expect(mockFetchCurrentStaff).not.toHaveBeenCalled());

    // Cache holds only the safe identity fields.
    expect(queryClient.getQueryData(STAFF_SELF_QUERY_KEY)).toEqual({
      id: 'staff-fixture-id-0001',
      email: 'admin@example.test',
      displayName: 'Quản trị Xưởng',
    });
  });
});
