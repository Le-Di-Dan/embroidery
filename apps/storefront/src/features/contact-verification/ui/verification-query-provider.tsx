'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ContactVerificationScreen } from './contact-verification-screen';

/**
 * The route-local TanStack boundary, following the `APP2-S01` precedent: the
 * Storefront is server-first and has no global provider, so the client is scoped
 * to the one route that needs it.
 *
 * Two defaults matter here beyond convention:
 *
 * - **No retry.** A silently replayed issue or resend would spend the
 *   customer's rate budget on requests they never made, and a replayed attempt
 *   would spend their attempt budget. Every failure surfaces as an approved
 *   state with an explicit action instead.
 * - **Nothing is cached.** `gcTime: 0` means a settled mutation is dropped
 *   rather than parked in the cache — which, together with mutations that carry
 *   no variables, is why no snapshot of the cache can contain a verification
 *   code.
 */
function createVerificationQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export function VerificationQueryProvider({ children }: { children?: ReactNode }) {
  const [queryClient] = useState(createVerificationQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children ?? <ContactVerificationScreen />}
    </QueryClientProvider>
  );
}
