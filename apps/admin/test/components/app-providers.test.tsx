import { renderWithProviders, screen } from '@embroidery/frontend-testing';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../src/providers/app-providers';

let captured: QueryClient | undefined;

function QueryClientProbe() {
  captured = useQueryClient();
  return <span>probe</span>;
}

beforeEach(() => {
  captured = undefined;
});

describe('AppProviders', () => {
  it('renders children', () => {
    renderWithProviders(
      <AppProviders>
        <p>child content</p>
      </AppProviders>,
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('provides its own QueryClient to descendants', () => {
    const { queryClient: outer } = renderWithProviders(
      <AppProviders>
        <QueryClientProbe />
      </AppProviders>,
    );
    expect(captured).toBeDefined();
    // The nearest client is AppProviders' own, not the outer test client.
    expect(captured).not.toBe(outer);
  });
});
