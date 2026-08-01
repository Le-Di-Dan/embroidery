'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useNavigationGuard } from '../../../shared/navigation/navigation-guard';
import { ADMIN_PRIMARY_NAV, resolveNavItemState } from '../model/admin-shell-nav';
import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

interface AdminPrimaryNavProps {
  /** `sidebar` renders the desktop rail; `drawer` renders inside the mobile drawer. */
  variant: 'sidebar' | 'drawer';
}

/**
 * Primary navigation. The current page is rendered as static text with
 * `aria-current="page"` — never a link to itself — while a section that merely
 * *contains* the current page stays a real link, so a detail screen never traps
 * the operator inside its own section. Both carry the same visual treatment: the
 * highlight says where you are, the element says whether there is anywhere to go.
 *
 * Every entry links to an implemented route, so there are still no dead anchors.
 * A note explains that further operational areas arrive in later phases. The two
 * variants carry distinct accessible names so the desktop rail and the drawer
 * copy do not collide for assistive tech.
 *
 * Navigation is routed through the shared guard rather than left to the anchor,
 * so a screen holding unsaved work can ask before the departure happens. The
 * `href` is kept intact: it is what makes the entry a real link for the browser
 * (new tab, middle click, copy address), and those exits leave the screen
 * mounted or are covered by `beforeunload`.
 */
export function AdminPrimaryNav({ variant }: AdminPrimaryNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const requestNavigation = useNavigationGuard();
  const label =
    variant === 'drawer' ? ADMIN_SHELL_COPY.nav.drawerLabel : ADMIN_SHELL_COPY.nav.sidebarLabel;

  return (
    <nav className={`admin-shell__nav admin-shell__nav--${variant}`} aria-label={label}>
      <ul className="admin-shell__nav-list">
        {ADMIN_PRIMARY_NAV.map((item) => {
          const state = resolveNavItemState(item, pathname);
          const className =
            state === 'none'
              ? 'admin-shell__nav-item'
              : 'admin-shell__nav-item admin-shell__nav-item--current';

          return (
            <li key={item.id} className="admin-shell__nav-row">
              {state === 'page' ? (
                <span className={className} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  className={className}
                  href={item.href}
                  onClick={(event) => {
                    // Leave every exit the browser owns alone.
                    if (event.defaultPrevented || event.button !== 0) {
                      return;
                    }
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                      return;
                    }
                    event.preventDefault();
                    requestNavigation(() => router.push(item.href));
                  }}
                >
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
