import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
} from '@embroidery/frontend-testing';

import { StaffLoginScreen } from '../../src/features/staff-auth';
import { BRAND_NAME } from '@embroidery/ui';

jest.mock('next/navigation', () => mockCreateNavigationMock().module);

describe('StaffLoginScreen — rendering and semantics', () => {
  it('renders exactly one page heading (the form title)', () => {
    renderWithProviders(<StaffLoginScreen />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Đăng nhập');
  });

  it('renders labelled email and password controls with correct autocomplete', () => {
    renderWithProviders(<StaffLoginScreen />);
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Mật khẩu');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('renders the submit button and the password visibility toggle', () => {
    renderWithProviders(<StaffLoginScreen />);
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the approved brand copy', () => {
    renderWithProviders(<StaffLoginScreen />);
    // The approved login application (`589:36`) is symbol + brand name + one
    // supporting label. The former `BẢNG QUẢN TRỊ` eyebrow said the same thing
    // as `Quản trị xưởng` one line later, so the mockup's two-line form replaced
    // it rather than stacking three.
    expect(screen.getByText('Quản trị xưởng')).toBeInTheDocument();
    expect(screen.getByText(BRAND_NAME)).toBeInTheDocument();
  });

  it('offers no self-service auth affordances', () => {
    renderWithProviders(<StaffLoginScreen />);
    expect(screen.queryByText(/quên mật khẩu/i)).toBeNull();
    expect(screen.queryByText(/ghi nhớ/i)).toBeNull();
    expect(screen.queryByText(/đăng ký/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows no error alert in the default state', () => {
    renderWithProviders(<StaffLoginScreen />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
