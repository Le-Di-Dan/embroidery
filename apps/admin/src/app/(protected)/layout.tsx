import type { ReactNode } from 'react';

import { AdminShell } from '../../features/admin-shell';
import { requireServerStaffSession } from '../../server/staff-session-access';

/**
 * Authenticated Admin boundary. Every route inside the `(protected)` group
 * inherits this layout, so its server-side session check gates the whole
 * authenticated surface and its resolved identity seeds the shared Admin shell —
 * exactly one `GET /api/staff/me` per navigation. An unauthenticated request is
 * redirected to `/login`; a dependency failure surfaces to the error boundary
 * rather than being treated as signed-out. The route group adds no URL segment.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const staff = await requireServerStaffSession();
  return <AdminShell initialStaff={staff}>{children}</AdminShell>;
}
