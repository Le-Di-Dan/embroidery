'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ADMIN_PRIMARY_NAV, isCurrentNavItem } from '../model/admin-shell-nav';
import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

interface AdminPrimaryNavProps {
  /** `sidebar` renders the desktop rail; `drawer` renders inside the mobile drawer. */
  variant: 'sidebar' | 'drawer';
}

/**
 * Primary navigation. The current location is rendered as static text with
 * `aria-current="page"` — never a link to itself — and every other entry links
 * to an implemented route, so there are still no dead anchors. A note explains
 * that further operational areas arrive in later phases. The two variants carry
 * distinct accessible names so the desktop rail and the drawer copy do not
 * collide for assistive tech.
 */
export function AdminPrimaryNav({ variant }: AdminPrimaryNavProps) {
  const pathname = usePathname();
  const label =
    variant === 'drawer' ? ADMIN_SHELL_COPY.nav.drawerLabel : ADMIN_SHELL_COPY.nav.sidebarLabel;

  return (
    <nav className={`admin-shell__nav admin-shell__nav--${variant}`} aria-label={label}>
      <ul className="admin-shell__nav-list">
        {ADMIN_PRIMARY_NAV.map((item) => {
          const current = isCurrentNavItem(item, pathname);
          return (
            <li key={item.id} className="admin-shell__nav-row">
              {current ? (
                <span
                  className="admin-shell__nav-item admin-shell__nav-item--current"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <Link className="admin-shell__nav-item" href={item.href}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="admin-shell__nav-note">{ADMIN_SHELL_COPY.nav.future}</p>
    </nav>
  );
}
