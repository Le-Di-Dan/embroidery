'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Route-local TanStack Query boundary for the Discover feed.
 *
 * Deliberately **not** a global Storefront provider. The Storefront is
 * server-first and every other route today renders without client server-state;
 * a root-level provider would put a client boundary above pages that do not need
 * one. Scoping the client to this route keeps that cost where the feature is.
 *
 * The client is created in `useState` so each mounted app gets its own instance
 * and no module global is shared between concurrent server requests.
 */
function createDiscoverQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // No automatic retry: a silent replay of a failed cursor would issue
      // requests the visitor never asked for. Failures surface as the approved
      // copy with an explicit "Thử lại".
      queries: { retry: false },
    },
  });
}

export function DiscoverQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createDiscoverQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
