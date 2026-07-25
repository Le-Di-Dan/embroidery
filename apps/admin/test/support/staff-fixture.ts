import type { CurrentStaffResponse } from '@embroidery/api-client';

/**
 * Safe current-staff fixture for shell tests. The email uses the reserved
 * `.test` TLD and never a real personal address; `id` is a synthetic value used
 * to assert it is NOT rendered in the shell.
 */
export const ADMIN_STAFF_FIXTURE: CurrentStaffResponse = {
  id: 'staff-fixture-id-0001',
  email: 'admin@example.test',
  displayName: 'Quản trị Xưởng',
};
