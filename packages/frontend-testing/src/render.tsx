import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';

import { createTestQueryClient } from './query-client';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Supply a `QueryClient` to assert on cache state; otherwise a fresh one is created. */
  queryClient?: QueryClient;
}

export interface RenderWithProvidersResult extends RenderResult {
  /** The `QueryClient` used for this render (the one passed in, or a fresh one). */
  queryClient: QueryClient;
}

/**
 * Render a React element inside the shared client-side providers used by both
 * frontend apps. Every call gets a fresh `QueryClient` unless one is supplied,
 * so tests are isolated by default. Add further providers (theme, design
 * system) here as they are introduced — this is the single seam for them.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  function Providers({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, ...render(ui, { wrapper: Providers, ...renderOptions }) };
}
