'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { NavigationGuardProvider } from '../shared/navigation/navigation-guard';

/**
 * One browser `QueryClient` per mounted application. Mutations never retry
 * (login is non-idempotent); queries default to no retry so failures surface.
 * There is no module-global client, so no server request shares cache state.
 */
function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Client provider boundary for the Admin app. Kept minimal so the root layout
 * can remain a Server Component; add further client providers here as they are
 * introduced.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationGuardProvider>{children}</NavigationGuardProvider>
    </QueryClientProvider>
  );
}
