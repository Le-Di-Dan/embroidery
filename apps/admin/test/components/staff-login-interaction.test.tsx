import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { StaffLoginScreen } from '../../src/features/staff-auth';
import { submitStaffLogin } from '../../src/features/staff-auth/services/staff-login.service';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/staff-auth/services/staff-login.service', () => ({
  submitStaffLogin: jest.fn(),
}));

const mockSubmit = submitStaffLogin as jest.MockedFunction<typeof submitStaffLogin>;
const router = useRouter() as unknown as { replace: jest.Mock; refresh: jest.Mock };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockSubmit.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

async function fillValidCredentials(user: ReturnType<typeof createUser>): Promise<void> {
  await user.type(screen.getByLabelText('Email'), 'admin@example.test');
  await user.type(screen.getByLabelText('Mật khẩu'), 'correct horse');
}

describe('StaffLoginScreen — interaction', () => {
  it('toggles password visibility and updates the accessible name', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    const password = screen.getByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    const hideToggle = screen.getByRole('button', { name: 'Ẩn mật khẩu' });
    expect(hideToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(hideToggle);
    expect(password).toHaveAttribute('type', 'password');
  });

  it('submits the normalized credentials via the button', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    // TanStack Query passes a second context arg; only the credentials matter here.
    expect(mockSubmit.mock.calls[0]?.[0]).toEqual({
      email: 'admin@example.test',
      password: 'correct horse',
    });
  });

  it('submits when Enter is pressed inside a field', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await fillValidCredentials(user);
    await user.type(screen.getByLabelText('Mật khẩu'), '{Enter}');

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  });

  it('navigates to the Admin root and refreshes after a 204 success', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the pending state and blocks duplicate submission while in flight', async () => {
    const pending = deferred<void>();
    mockSubmit.mockReturnValue(pending.promise);
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await fillValidCredentials(user);

    const submit = screen.getByRole('button', { name: 'Đăng nhập' });
    await user.click(submit);

    const pendingButton = await screen.findByRole('button', { name: 'Đang đăng nhập…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Email')).toBeDisabled();

    await user.click(pendingButton);
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});
