import { ADMIN_PRIMARY_NAV } from '../model/admin-shell-nav';
import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

interface AdminPrimaryNavProps {
  /** `sidebar` renders the desktop rail; `drawer` renders inside the mobile drawer. */
  variant: 'sidebar' | 'drawer';
}

/**
 * Primary navigation. APP1-A02 has no business routes, so the current location
 * is rendered as static text with `aria-current="page"` — never a link to an
 * unbuilt route (no dead anchors). A note explains that operational areas arrive
 * in later phases. The two variants carry distinct accessible names so the
 * desktop rail and the drawer copy do not collide for assistive tech.
 */
export function AdminPrimaryNav({ variant }: AdminPrimaryNavProps) {
  const label =
    variant === 'drawer' ? ADMIN_SHELL_COPY.nav.drawerLabel : ADMIN_SHELL_COPY.nav.sidebarLabel;

  return (
    <nav className={`admin-shell__nav admin-shell__nav--${variant}`} aria-label={label}>
      <ul className="admin-shell__nav-list">
        {ADMIN_PRIMARY_NAV.map((item) => (
          <li key={item.id} className="admin-shell__nav-row">
            <span
              className="admin-shell__nav-item admin-shell__nav-item--current"
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="admin-shell__nav-note">{ADMIN_SHELL_COPY.nav.future}</p>
    </nav>
  );
}
