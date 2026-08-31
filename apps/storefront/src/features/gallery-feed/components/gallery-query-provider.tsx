'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Route-local TanStack Query boundary for the gallery feed.
 *
 * Deliberately **not** a global Storefront provider, for the reason
 * `DiscoverQueryProvider` gives: the Storefront is server-first and most routes
 * render with no client server-state, so a root-level provider would put a
 * client boundary above pages that do not need one. Scoping the client to this
 * route keeps that cost where the feature is.
 *
 * A second provider rather than a shared one, because sharing would mean lifting
 * both routes' clients into a common ancestor — which is the root layout, and
 * therefore the global provider neither feature wants.
 *
 * The client is created in `useState` so each mounted app gets its own instance
 * and no module global is shared between concurrent server requests.
 */
function createGalleryQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // No automatic retry: a silent replay of a failed cursor would issue
      // requests the visitor never asked for. Failures surface as the approved
      // copy with an explicit "Thử lại".
      queries: { retry: false },
    },
  });
}

export function GalleryQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createGalleryQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
