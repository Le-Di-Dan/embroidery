'use client';

/**
 * The route-local TanStack boundary for `/mua-hang/[slug]` (`APP12-S02` §39).
 *
 * The Storefront is server-first and has no global provider, so the client is
 * scoped to the one route that needs it — the `APP2-S01` precedent that
 * `APP4-S01` and `APP5-S01` both follow. Everything above this component on the
 * page is a Server Component: the read, the hint resolution, the summary facts
 * and the metadata. The interactive island starts here and goes no further than
 * the checkout form.
 *
 * The defaults are the ones the verification flow chose, for the same reasons,
 * and they matter more here because this route also *creates an order*:
 *
 * - **No retry.** A silently replayed verification request spends the customer's
 *   rate budget on something they did not ask for; a silently replayed create is
 *   the one thing an approved refusal state exists to put in front of them
 *   instead. The server would replay rather than duplicate — the challenge is
 *   the idempotency scope — but the customer would be told nothing while it
 *   happened.
 * - **Nothing is cached.** `gcTime: 0` drops a settled mutation rather than
 *   parking it, so no snapshot of the cache holds a verification code, a
 *   challenge id or the customer's delivery address after the screen is done
 *   with it (§19).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { ReadyMadeCheckoutView } from '../model/checkout-view';
import { CheckoutScreen } from './checkout-screen';

function createCheckoutQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export function CheckoutQueryProvider({ view }: { readonly view: ReadyMadeCheckoutView }) {
  const [queryClient] = useState(createCheckoutQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <CheckoutScreen view={view} />
    </QueryClientProvider>
  );
}
