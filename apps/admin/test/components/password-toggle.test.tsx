import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
} from '@embroidery/frontend-testing';

import { StaffLoginScreen } from '../../src/features/staff-auth';
import { submitStaffLogin } from '../../src/features/staff-auth/services/staff-login.service';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);
jest.mock('../../src/features/staff-auth/services/staff-login.service', () => ({
  submitStaffLogin: jest.fn(),
}));

const mockSubmit = submitStaffLogin as jest.MockedFunction<typeof submitStaffLogin>;

beforeEach(() => mockSubmit.mockReset());

function passwordInput(): HTMLElement {
  return screen.getByLabelText('Mật khẩu');
}

describe('password visibility toggle (A01-FU01)', () => {
  it('is a non-submitting button that never posts the form', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggle).toHaveAttribute('type', 'button');

    await user.type(passwordInput(), 'S3cret-value');
    await user.click(toggle);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('cycles password → text → password on mouse activation', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    expect(passwordInput()).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(passwordInput()).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(passwordInput()).toHaveAttribute('type', 'password');
  });

  it('activates with the Enter key', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    screen.getByRole('button', { name: 'Hiện mật khẩu' }).focus();
    await user.keyboard('{Enter}');
    expect(passwordInput()).toHaveAttribute('type', 'text');
  });

  it('activates with the Space key', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    screen.getByRole('button', { name: 'Hiện mật khẩu' }).focus();
    await user.keyboard(' ');
    expect(passwordInput()).toHaveAttribute('type', 'text');
  });

  it('preserves the typed value across a visibility toggle', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    await user.type(passwordInput(), 'Keep-This-Value-1');
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));

    expect(passwordInput()).toHaveValue('Keep-This-Value-1');
    expect(passwordInput()).toHaveAttribute('type', 'text');
  });

  it('reflects the visible state via aria-pressed and accessible name', async () => {
    const user = createUser();
    renderWithProviders(<StaffLoginScreen />);
    const show = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(show).toHaveAttribute('aria-pressed', 'false');

    await user.click(show);
    const hide = screen.getByRole('button', { name: 'Ẩn mật khẩu' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
  });
});
