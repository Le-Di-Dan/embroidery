'use client';

import { type CurrentStaffResponse } from '@embroidery/api-client';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { useScrollLock } from '../hooks/use-scroll-lock';
import { type StaffLogoutMutation } from '../hooks/use-staff-logout-mutation';
import { AdminBrand } from './admin-brand';
import { AdminIdentity } from './admin-identity';
import { AdminLogoutButton } from './admin-logout-button';
import { AdminPrimaryNav } from './admin-primary-nav';
import { ADMIN_MOBILE_DRAWER_ID } from './admin-app-bar';

interface AdminMobileDrawerProps {
  open: boolean;
  onClose: () => void;
  staff: CurrentStaffResponse;
  logout: StaffLogoutMutation;
}

/**
 * Mobile navigation drawer (FIG-ADMIN-SHELL-MOBILE-NAVOPEN). A semantic modal
 * dialog: focus enters on open and is trapped, Escape and the backdrop close it,
 * an explicit close button is provided, and focus returns to the trigger on
 * close (all via `useFocusTrap`). Background scroll is locked while open. It is
 * unmounted when closed, so no background listener or focusable leaks.
 */
export function AdminMobileDrawer({ open, onClose, staff, logout }: AdminMobileDrawerProps) {
  const dialogRef = useFocusTrap(open, onClose);
  useScrollLock(open);

  if (!open) {
    return null;
  }

  return (
    <div className="admin-shell__drawer-root">
      <div
        className="admin-shell__scrim admin-shell__scrim--drawer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id={ADMIN_MOBILE_DRAWER_ID}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ADMIN_SHELL_COPY.nav.drawerLabel}
        className="admin-shell__drawer"
      >
        <div className="admin-shell__drawer-head">
          <AdminBrand />
          <button
            type="button"
            className="admin-shell__drawer-close"
            aria-label={ADMIN_SHELL_COPY.nav.closeMenu}
            onClick={onClose}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <AdminIdentity staff={staff} />
        <AdminPrimaryNav variant="drawer" />
        <AdminLogoutButton logout={logout} />
      </div>
    </div>
  );
}
