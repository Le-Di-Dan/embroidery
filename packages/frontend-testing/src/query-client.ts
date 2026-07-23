import { QueryClient } from '@tanstack/react-query';

/**
 * Create a fresh, deterministic `QueryClient` for a single test or render.
 *
 * No retries (failures surface immediately), no caching across tests
 * (`gcTime: 0`, `staleTime: 0`). Always returns a new instance — there is no
 * shared singleton, so one test can never leak cached data into another.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}
