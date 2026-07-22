import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../styles/main.scss';

export const metadata: Metadata = {
  title: 'Embroidery Commerce — Admin',
  description: 'Bảng điều khiển quản trị cửa hàng thêu.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
