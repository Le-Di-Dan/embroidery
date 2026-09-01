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

  /**
   * The trap's property is that focus visits every focusable in the drawer in
   * DOM order and wraps at both ends — not that there are exactly five of them.
   * `APP12-G02` §9 makes the number release-dependent: while Wave 2 is withheld
   * the custom-request item renders through the existing non-interactive branch
   * and is therefore not focusable, and releasing Wave 2 restores it. Running
   * the same walk in both states proves the trap holds either way, which is
   * strictly more than the fixed five-stop version proved.
   */
  it.each([
    ['withheld', 'false', ['Khám phá', 'Bộ sưu tập']],
    ['released', 'true', ['Khám phá', 'Bộ sưu tập', 'Đặt thêu']],
  ])('traps focus, cycling on Tab and Shift+Tab (Wave 2 %s)', async (_state, flag, areas) => {
    const key = 'CUSTOM_EMBROIDERY_RELEASE_ENABLED';
    const previous = process.env[key];
    process.env[key] = flag;
    try {
      const user = createUser();
      renderShell();
      await user.click(trigger());
      const dialog = screen.getByRole('dialog', { name: 'Điều hướng' });
      const brand = within(dialog).getByRole('link', { name: 'Xưởng Thêu — về trang chủ' });
      const close = within(dialog).getByRole('button', { name: 'Đóng menu điều hướng' });

      // The routed primary-nav areas, in IA order. Unrouted items stay
      // non-focusable, so the last routed area is the last stop in the trap.
      const stops = areas.map((name) => within(dialog).getByRole('link', { name }));
      const last = stops[stops.length - 1] as HTMLElement;

      expect(brand).toHaveFocus();
      await user.keyboard('{Tab}');
      expect(close).toHaveFocus();
      for (const stop of stops) {
        await user.keyboard('{Tab}');
        expect(stop).toHaveFocus();
      }
      await user.keyboard('{Tab}');
      expect(brand).toHaveFocus(); // wraps forward
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(last).toHaveFocus(); // wraps backward
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
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
