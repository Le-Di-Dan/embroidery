'use client';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { type StaffLogoutMutation } from '../hooks/use-staff-logout-mutation';

interface AdminLogoutButtonProps {
  logout: StaffLogoutMutation;
}

/**
 * Logout control. Activation is blocked while a request is in flight (guard +
 * `disabled`), so logout can never be double-submitted, and there is no
 * automatic retry (the mutation disables it). A 204/401 ends the session and
 * navigates away; only a genuine dependency failure keeps the shell here, where
 * a safe, non-technical error with a manual retry is shown (never a raw error).
 */
export function AdminLogoutButton({ logout }: AdminLogoutButtonProps) {
  const { mutate, isPending, isError } = logout;

  const handleActivate = (): void => {
    if (isPending) {
      return;
    }
    mutate();
  };

  return (
    <div className="admin-shell__logout">
      <button
        type="button"
        className="admin-shell__logout-button"
        onClick={handleActivate}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? ADMIN_SHELL_COPY.logout.pending : ADMIN_SHELL_COPY.logout.action}
      </button>
      {isError ? (
        <p className="admin-shell__logout-error" role="alert">
          <span>{ADMIN_SHELL_COPY.logout.error}</span>{' '}
          <button type="button" className="admin-shell__logout-retry" onClick={handleActivate}>
            {ADMIN_SHELL_COPY.logout.retry}
          </button>
        </p>
      ) : null}
    </div>
  );
}
