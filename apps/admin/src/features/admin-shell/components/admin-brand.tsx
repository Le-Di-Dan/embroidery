import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

/**
 * Shell brand mark: eyebrow + wordmark. Presentational; reused in the desktop
 * app bar and the mobile drawer header. Matches the login brand vocabulary
 * (FIG-ADMIN-SHELL-* / FIG-ADMIN-LOGIN-*).
 */
export function AdminBrand() {
  const { eyebrow, title } = ADMIN_SHELL_COPY.brand;
  return (
    <span className="admin-shell__brand">
      <span className="admin-shell__brand-eyebrow">{eyebrow}</span>
      <span className="admin-shell__brand-title">{title}</span>
    </span>
  );
}
