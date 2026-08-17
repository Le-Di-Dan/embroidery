import {
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

function renderShell() {
  return renderWithProviders(
    <StorefrontShell>
      <h1>Trang mẫu</h1>
    </StorefrontShell>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Mở menu điều hướng' });
}

describe('StorefrontShell — mobile navigation drawer', () => {
  it('opens the drawer, moves focus inside, and reports expanded state + scroll lock', async () => {
    const user = createUser();
    renderShell();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger());

    const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    // Focus enters the dialog (first focusable = the brand home link).
    const brand = within(dialog).getByRole('link', { name: 'Xưởng Thêu — về trang chủ' });
    expect(brand).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('traps focus, cycling on Tab and Shift+Tab', async () => {
    const user = createUser();
    renderShell();
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });
    const brand = within(dialog).getByRole('link', { name: 'Xưởng Thêu — về trang chủ' });
    const close = within(dialog).getByRole('button', { name: 'Đóng menu điều hướng' });

    // The drawer's third and fourth focusables are the two built primary-nav
    // areas: Discover (APP2-S01) and the custom request (APP5-S01). The unrouted
    // items stay non-focusable, so the request link is the last stop in the trap.
    const discover = within(dialog).getByRole('link', { name: 'Khám phá' });
    const request = within(dialog).getByRole('link', { name: 'Đặt thêu' });

    expect(brand).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(discover).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(request).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(brand).toHaveFocus(); // wraps forward
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(request).toHaveFocus(); // wraps backward
  });

  it('closes on the explicit close button and restores focus to the trigger', async () => {
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

  it('closes on Escape and returns focus to the trigger', async () => {
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
    const scrim = container.querySelector('.storefront-shell__scrim');
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
