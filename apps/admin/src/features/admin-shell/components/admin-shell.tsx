'use client';

import { type CurrentStaffResponse } from '@embroidery/api-client';
import { useState, type ReactNode } from 'react';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { deriveSessionExpiry } from '../model/session-expiry';
import { useCurrentStaffQuery } from '../hooks/use-current-staff-query';
import { useReturnToLogin } from '../hooks/use-return-to-login';
import { useStaffLogoutMutation } from '../hooks/use-staff-logout-mutation';
import { AdminAppBar } from './admin-app-bar';
import { AdminMobileDrawer } from './admin-mobile-drawer';
import { AdminPrimaryNav } from './admin-primary-nav';
import { SessionExpiredDialog } from './session-expired-dialog';

/** DOM id of the main content region; the skip link targets it. */
const ADMIN_MAIN_ID = 'admin-main';

interface AdminShellProps {
  /** Server-resolved identity from the protected layout; seeds the client query. */
  initialStaff: CurrentStaffResponse;
  children: ReactNode;
}

/**
 * The shared authenticated Admin shell. It lives in the protected route-group
 * layout, so every protected page inherits it. The server already resolved the
 * session and passes `initialStaff`; the client query is seeded from it and does
 * not refetch on mount (one initial backend call per navigation).
 *
 * The shell owns the drawer state and the derived session state: a later refetch
 * 401 shows the session-expired modal, while a transient dependency failure only
 * shows a reconnect status and keeps the shell fully usable.
 */
export function AdminShell({ initialStaff, children }: AdminShellProps) {
  const query = useCurrentStaffQuery(initialStaff);
  const logout = useStaffLogoutMutation();
  const returnToLogin = useReturnToLogin();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const expiry = deriveSessionExpiry(query);
  const staff = query.data ?? initialStaff;
  const reconnecting = expiry === 'reconnecting';
  const loading = query.isFetching && expiry === 'active';

  return (
    <div className="admin-shell">
      <a className="admin-shell__skip-link" href={`#${ADMIN_MAIN_ID}`}>
        {ADMIN_SHELL_COPY.skipToContent}
      </a>
      <AdminAppBar
        staff={staff}
        loading={loading}
        reconnecting={reconnecting}
        navOpen={drawerOpen}
        logout={logout}
        onOpenNav={() => setDrawerOpen(true)}
      />
      <div className="admin-shell__body">
        <AdminPrimaryNav variant="sidebar" />
        <main id={ADMIN_MAIN_ID} className="admin-shell__main">
          {children}
        </main>
      </div>
      <AdminMobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        staff={staff}
        logout={logout}
      />
      {expiry === 'expired' ? (
        <SessionExpiredDialog
          onRelogin={() => {
            void returnToLogin();
          }}
        />
      ) : null}
    </div>
  );
}
