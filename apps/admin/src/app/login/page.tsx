import type { Metadata } from 'next';

import { StaffLoginScreen } from '../../features/staff-auth';

// The Admin console is not for public indexing; the login route is explicitly
// non-indexable in addition to the app-wide robots policy.
export const metadata: Metadata = {
  title: 'Đăng nhập · Bảng quản trị',
  description: 'Đăng nhập dành cho quản trị viên Xưởng Thêu.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <StaffLoginScreen />;
}
