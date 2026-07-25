import { act } from 'react';

import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { StaffLoginScreen } from '../../src/features/staff-auth';
import { submitStaffLogin } from '../../src/features/staff-auth/services/staff-login.service';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/staff-auth/services/staff-login.service', () => ({
  submitStaffLogin: jest.fn(),
}));

const mockSubmit = submitStaffLogin as jest.MockedFunction<typeof submitStaffLogin>;
const router = useRouter() as unknown as { replace: jest.Mock; refresh: jest.Mock };

beforeEach(() => {
  mockSubmit.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

function typeValid(): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'secret-pass' } });
}

describe('StaffLoginScreen — client validation', () => {
  it('blocks submission and shows field errors when empty', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the API', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByText('Địa chỉ email không hợp lệ.')).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error once the user edits that field', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'a');
    expect(screen.queryByText('Vui lòng nhập email.')).toBeNull();
  });
});

describe('StaffLoginScreen — server errors', () => {
  it('maps backend field errors onto the matching control', async () => {
    mockSubmit.mockRejectedValue(
      makeApiClientError({
        status: 400,
        code: 'BAD_REQUEST',
        errors: [{ field: 'email', code: 'INVALID', message: 'x' }],
      }),
    );
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Địa chỉ email không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    // No raw payload or request id leaks into the UI.
    expect(screen.queryByText(/req-test/)).toBeNull();
  });

  it('shows a safe form-level fallback for an unknown field error', async () => {
    mockSubmit.mockRejectedValue(
      makeApiClientError({
        status: 400,
        code: 'BAD_REQUEST',
        errors: [{ field: 'captcha', code: 'REQUIRED', message: 'x' }],
      }),
    );
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.');
  });

  it('shows one generic alert for an authentication failure and reveals nothing', async () => {
    mockSubmit.mockRejectedValue(makeApiClientError({ status: 401, code: 'STAFF_LOGIN_FAILED' }));
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(alert).not.toHaveTextContent(/không tồn tại|bị khóa|sai mật khẩu/i);
  });

  it('shows a safe fallback for a network failure and allows a retry', async () => {
    mockSubmit.mockRejectedValueOnce(makeNetworkError());
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hiện chưa thể đăng nhập. Vui lòng thử lại.',
    );

    mockSubmit.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});

describe('StaffLoginScreen — rate limiting', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('warns with a countdown, disables submit, then re-enables without reload', async () => {
    jest.useFakeTimers();
    mockSubmit.mockRejectedValue(
      makeApiClientError({
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        headers: { 'retry-after': '120' },
      }),
    );
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      await Promise.resolve();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('khoảng 2 phút');
    expect(screen.getByRole('button', { name: 'Thử lại sau ít phút' })).toBeDisabled();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
    expect(mockSubmit).toHaveBeenCalledTimes(1); // never auto-resubmits
  });

  it('falls back to a non-countdown message when Retry-After is invalid', async () => {
    jest.useFakeTimers();
    mockSubmit.mockRejectedValue(
      makeApiClientError({
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        headers: { 'retry-after': 'later' },
      }),
    );
    renderWithProviders(<StaffLoginScreen />);
    typeValid();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('vui lòng thử lại sau ít phút');
    // Without a valid wait, the button is not left permanently blocked.
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
  });
});
