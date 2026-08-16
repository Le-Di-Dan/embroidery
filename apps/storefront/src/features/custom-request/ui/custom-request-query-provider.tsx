'use client';

/**
 * The route-local TanStack boundary for `/yeu-cau/moi`.
 *
 * The Storefront is server-first and has no global provider, so the client is
 * scoped to the one route that needs it — the `APP2-S01` precedent that
 * `APP4-S01` also follows.
 *
 * The defaults are the same ones the verification flow chose, for the same
 * reasons, and they matter more here because this route also uploads and
 * submits:
 *
 * - **No retry.** A silently replayed issue or resend spends the customer's rate
 *   budget on a request they never made; a silently replayed *submission* is the
 *   one thing an approved state exists to put in front of them instead. Every
 *   failure surfaces as a state with an explicit action.
 * - **Nothing is cached.** `gcTime: 0` drops a settled mutation rather than
 *   parking it, so no snapshot of the cache holds a verification code, a file,
 *   or a submission body carrying the challenge id it is scoped by.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { CustomRequestScreen } from './custom-request-screen';

function createCustomRequestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export function CustomRequestQueryProvider({ children }: { children?: ReactNode }) {
  const [queryClient] = useState(createCustomRequestQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children ?? <CustomRequestScreen />}
    </QueryClientProvider>
  );
}
