'use client';

import { type CurrentStaffResponse } from '@embroidery/api-client';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { type StaffLogoutMutation } from '../hooks/use-staff-logout-mutation';
import { AdminBrand } from './admin-brand';
import { AdminIdentity } from './admin-identity';
import { AdminLogoutButton } from './admin-logout-button';
import { AdminShellStatus } from './admin-shell-status';

/** DOM id of the mobile drawer; the nav trigger points at it via aria-controls. */
export const ADMIN_MOBILE_DRAWER_ID = 'admin-mobile-drawer';

interface AdminAppBarProps {
  staff: CurrentStaffResponse;
  loading: boolean;
  reconnecting: boolean;
  navOpen: boolean;
  logout: StaffLogoutMutation;
  onOpenNav: () => void;
}

/**
 * Top application bar (FIG-ADMIN-SHELL-DESKTOP-DEFAULT / -MOBILE-DEFAULT):
 * brand, a mobile-only navigation trigger, the polite status region, and the
 * authenticated identity + logout on the trailing edge. The trigger is a real
 * button that reports its expanded state and controls the drawer; on desktop it
 * is hidden and the persistent sidebar is used instead.
 */
export function AdminAppBar({
  staff,
  loading,
  reconnecting,
  navOpen,
  logout,
  onOpenNav,
}: AdminAppBarProps) {
  return (
    <header className="admin-shell__bar">
      <div className="admin-shell__bar-lead">
        <button
          type="button"
          className="admin-shell__nav-trigger"
          aria-label={ADMIN_SHELL_COPY.nav.openMenu}
          aria-expanded={navOpen}
          aria-controls={ADMIN_MOBILE_DRAWER_ID}
          onClick={onOpenNav}
        >
          <span aria-hidden="true" className="admin-shell__nav-trigger-glyph">
            ☰
          </span>
        </button>
        <AdminBrand />
      </div>
      <AdminShellStatus loading={loading} reconnecting={reconnecting} />
      <div className="admin-shell__bar-trail">
        <AdminIdentity staff={staff} />
        <AdminLogoutButton logout={logout} />
      </div>
    </header>
  );
}
