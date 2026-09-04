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
 * brand, the polite status region, the authenticated identity + logout, and a
 * compact-only navigation trigger. The trigger is a real button that reports its
 * expanded state and controls the drawer; on desktop it is hidden and the
 * persistent sidebar is used instead.
 *
 * ## The compact bar carries the brand and the trigger, and nothing else
 *
 * DOM order is brand → status → identity/logout → trigger, and it is the reading
 * order of both tiers rather than a compromise between them. On the desktop bar
 * the trigger is hidden and the trailing edge holds the operator; on the compact
 * bar the trailing block is hidden and the trigger takes the trailing edge.
 *
 * Hidden with `display: none` rather than moved, so nothing is rendered twice
 * and — for the logout control specifically — no invisible button stays in the
 * tab order. The operator identity and logout are not lost on the compact tier:
 * the drawer has always carried its own, and that is now the only place they
 * appear there.
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
        <AdminBrand />
      </div>
      <AdminShellStatus loading={loading} reconnecting={reconnecting} />
      <div className="admin-shell__bar-trail">
        <AdminIdentity staff={staff} />
        <AdminLogoutButton logout={logout} />
      </div>
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
    </header>
  );
}
