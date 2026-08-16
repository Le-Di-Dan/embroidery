'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * The route-local TanStack boundary, following the `APP2-S01` and `APP4-S01`
 * precedent: the Storefront is server-first and has no global provider, so the
 * client is scoped to the one route that needs it.
 *
 * Three defaults matter here beyond convention:
 *
 * - **No retry.** A silently replayed call would fire requests the customer
 *   never asked for against the secure-link limiter, and would make "no
 *   automatic retry" (§15) a property of luck rather than of configuration. The
 *   transient screen offers an explicit button instead.
 * - **Nothing is cached.** `gcTime: 0` drops a settled mutation rather than
 *   parking it in the cache. Together with a mutation that carries no variables
 *   this is why no snapshot of the query cache can contain a secure-link token.
 * - **No queries at all.** This route performs exactly one mutation and never a
 *   query; the query defaults are set only so a future addition inherits the
 *   same posture rather than the library's.
 *
 * `children` is required. The provider used to default to APP4's own screen,
 * which made it a second mount point for a landing that already had one; now
 * the route names the screen it mounts and there is exactly one place a
 * fragment is read.
 */
function createSecureLinkQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export function SecureLinkQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createSecureLinkQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
