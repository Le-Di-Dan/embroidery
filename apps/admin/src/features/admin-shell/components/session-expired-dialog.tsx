'use client';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { useScrollLock } from '../hooks/use-scroll-lock';

interface SessionExpiredDialogProps {
  onRelogin: () => void;
}

/**
 * Session-expired modal (FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED / -MOBILE-). It
 * appears only after the shell was authenticated and a later refetch returned
 * 401. The already-authenticated shell stays recognizable beneath a non-opaque
 * scrim; background interaction is blocked (scroll lock + focus trap). It is an
 * `alertdialog` with a labelled title and description, focus moves in and is
 * trapped, and it cannot be dismissed into the stale shell — Escape is swallowed
 * (no `onEscape`) and the backdrop has no dismiss handler. The single action
 * returns to login.
 */
export function SessionExpiredDialog({ onRelogin }: SessionExpiredDialogProps) {
  const dialogRef = useFocusTrap(true);
  useScrollLock(true);

  return (
    <div className="admin-shell__expiry-root">
      <div className="admin-shell__scrim admin-shell__scrim--expiry" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-session-expired-title"
        aria-describedby="admin-session-expired-desc"
        className="admin-shell__expiry"
      >
        <h2 id="admin-session-expired-title" className="admin-shell__expiry-title">
          {ADMIN_SHELL_COPY.sessionExpired.title}
        </h2>
        <p id="admin-session-expired-desc" className="admin-shell__expiry-desc">
          {ADMIN_SHELL_COPY.sessionExpired.description}
        </p>
        <button type="button" className="admin-shell__expiry-action" onClick={onRelogin}>
          {ADMIN_SHELL_COPY.sessionExpired.action}
        </button>
      </div>
    </div>
  );
}
