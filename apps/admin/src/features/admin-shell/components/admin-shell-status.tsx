import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

interface AdminShellStatusProps {
  loading: boolean;
  reconnecting: boolean;
}

/**
 * Single polite status region for the shell (FIG-ADMIN-SHELL-DESKTOP-LOADING).
 * It announces a background current-staff refetch and a transient reconnect
 * without fabricating identity. The animated bar is decorative (`aria-hidden`)
 * so assistive tech hears one message, not a repeated one; the bar's motion is
 * disabled under `prefers-reduced-motion` in SCSS.
 */
export function AdminShellStatus({ loading, reconnecting }: AdminShellStatusProps) {
  return (
    <div className="admin-shell__status" role="status" aria-live="polite">
      {loading ? (
        <span className="admin-shell__status-text">{ADMIN_SHELL_COPY.loading.status}</span>
      ) : null}
      {reconnecting ? (
        <span className="admin-shell__status-text admin-shell__status-text--warn">
          {ADMIN_SHELL_COPY.reconnect.status}
        </span>
      ) : null}
      {loading ? <span className="admin-shell__status-bar" aria-hidden="true" /> : null}
    </div>
  );
}
