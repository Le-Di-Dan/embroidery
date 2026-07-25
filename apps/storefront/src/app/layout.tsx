import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { StorefrontShell } from '../features/storefront-shell';
import '../styles/main.scss';

export const metadata: Metadata = {
  title: 'Embroidery Commerce — Storefront',
  description: 'Cửa hàng thêu — sản phẩm nền và dịch vụ thêu theo yêu cầu.',
};

/**
 * Storefront root layout. It stays a Server Component and wraps every route in the
 * shared shell (header · `<main>` slot · footer). The shell owns the page
 * landmarks; each page owns its own `<h1>` and business content. The only client
 * interactivity (the mobile drawer) is isolated inside the shell's header island.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <StorefrontShell>{children}</StorefrontShell>
      </body>
    </html>
  );
}
