'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Route-local TanStack Query boundary for the Studio bootstrap.
 *
 * The Storefront has **no** global `QueryClient`, and that is a decision rather
 * than an omission: it is server-first, so a root-level provider would put a
 * client boundary above every page that needs no client server-state. The
 * accepted convention is one provider per route that has some, which is what
 * `APP2-S01` established for Discover, and this is the Studio's.
 *
 * The client is created inside `useState` so each mounted app gets its own
 * instance and no module global is shared between concurrent server requests.
 *
 * `retry: false` everywhere: every read on this route re-proves public
 * authority server-side, so a hidden replay would keep asking a question the
 * server has already answered. Failures surface as approved copy with an
 * explicit retry where a retry is meaningful at all.
 */
function createStudioQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function StudioQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createStudioQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
