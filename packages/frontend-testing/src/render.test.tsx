import { useQuery } from '@tanstack/react-query';

import { createTestQueryClient } from './query-client';
import { renderWithProviders } from './render';
import { screen, waitFor } from './index';

function Probe(): React.ReactElement {
  const { data, isPending } = useQuery({
    queryKey: ['probe'],
    queryFn: () => Promise.resolve('value'),
  });
  return <span>{isPending ? 'loading' : data}</span>;
}

describe('renderWithProviders', () => {
  it('renders inside the QueryClientProvider and resolves a query', async () => {
    renderWithProviders(<Probe />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('value')).toBeInTheDocument());
  });

  it('returns the QueryClient it used and accepts an injected one', () => {
    const queryClient = createTestQueryClient();
    const result = renderWithProviders(<span>hi</span>, { queryClient });
    expect(result.queryClient).toBe(queryClient);
  });

  it('does not touch the network', () => {
    // jsdom exposes no `fetch` by default; if a runtime provides one, prove the
    // render never calls it. Either way, rendering performs no live network.
    const globalFetch = (globalThis as { fetch?: unknown }).fetch;
    if (typeof globalFetch === 'function') {
      const fetchSpy = jest.spyOn(globalThis as { fetch: typeof fetch }, 'fetch');
      renderWithProviders(<span>offline</span>);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    } else {
      renderWithProviders(<span>offline</span>);
      expect(screen.getByText('offline')).toBeInTheDocument();
    }
  });
});
