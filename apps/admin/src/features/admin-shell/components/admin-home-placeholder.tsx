import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

/**
 * Root authenticated placeholder rendered in the shell's main region. It states
 * only that Admin access is active and that operational capabilities arrive in
 * later phases — no fake business data, metrics, charts or role/permission data
 * (CLAUDE.md §9, APP1-A02 §23). It carries the single page-level heading.
 */
export function AdminHomePlaceholder() {
  return (
    <section className="admin-shell__placeholder">
      <h1 className="admin-shell__placeholder-heading">{ADMIN_SHELL_COPY.placeholder.heading}</h1>
      <p className="admin-shell__placeholder-body">{ADMIN_SHELL_COPY.placeholder.body}</p>
    </section>
  );
}
