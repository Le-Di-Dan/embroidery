import type { ReactNode } from 'react';

import { requireServerStaffSession } from '../../server/staff-session-access';

/**
 * Authenticated Admin boundary. Every route inside the `(protected)` group
 * inherits this layout, so its server-side session check gates the whole
 * authenticated surface (currently the root placeholder; APP1-A02 adds the
 * shell). An unauthenticated request is redirected to `/login`; a dependency
 * failure surfaces to the error boundary rather than being treated as
 * signed-out. The route group adds no URL segment.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireServerStaffSession();
  return <>{children}</>;
}
