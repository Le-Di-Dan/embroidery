import { type CurrentStaffResponse } from '@embroidery/api-client';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';

interface AdminIdentityProps {
  staff: CurrentStaffResponse;
}

/**
 * Authenticated identity block: the static `Quản trị viên` actor label (product
 * copy, not an API role) plus the admin's display name and email. `id` stays
 * internal and no role/permission/session/credential field is rendered — the API
 * exposes only these three fields (there is one Admin actor, REQ-IDN-001).
 *
 * Long values are visually truncated in SCSS; the full value is preserved for
 * assistive tech (the text content is complete) and on hover via `title`.
 */
export function AdminIdentity({ staff }: AdminIdentityProps) {
  return (
    <div className="admin-shell__identity">
      <span className="admin-shell__identity-role">{ADMIN_SHELL_COPY.actor}</span>
      <span className="admin-shell__identity-name" title={staff.displayName}>
        {staff.displayName}
      </span>
      <span className="admin-shell__identity-email" title={staff.email}>
        {staff.email}
      </span>
    </div>
  );
}
