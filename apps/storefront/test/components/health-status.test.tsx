import { type ApiRequestOptions } from '@embroidery/api-client';
import { renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { HealthStatus } from '../fixtures/health-status';

const READINESS = {
  status: 'ready',
  service: 'api',
  database: { status: 'up', reason: 'ok' },
  timestamp: '1970-01-01T00:00:00.000Z',
} as const;

function mockOptions(): { options: ApiRequestOptions; request: jest.Mock } {
  const request = jest.fn().mockResolvedValue({ data: READINESS });
  return { options: { instance: { request } } as unknown as ApiRequestOptions, request };
}

describe('HealthStatus (storefront)', () => {
  it('imports the public api-client and renders loading then resolved status', async () => {
    const { options, request } = mockOptions();
    renderWithProviders(<HealthStatus options={options} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('status: ready')).toBeInTheDocument());
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/health/readiness', method: 'GET' }),
    );
  });

  it('performs no live network (only the injected request runs)', async () => {
    const globalFetch = (globalThis as { fetch?: unknown }).fetch;
    const fetchSpy =
      typeof globalFetch === 'function'
        ? jest.spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
        : undefined;
    const { options, request } = mockOptions();
    renderWithProviders(<HealthStatus options={options} />);
    await waitFor(() => expect(screen.getByText('status: ready')).toBeInTheDocument());
    expect(request).toHaveBeenCalledTimes(1);
    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }
  });
});
