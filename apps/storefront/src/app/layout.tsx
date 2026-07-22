import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../styles/main.scss';

export const metadata: Metadata = {
  title: 'Embroidery Commerce — Storefront',
  description: 'Cửa hàng thêu — sản phẩm nền và dịch vụ thêu theo yêu cầu.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
