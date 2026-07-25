import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import {
  createBrowserApiClient,
  healthCheck,
  healthReadiness,
  normalizeApiClientError,
  staffSessionCreate,
} from './index';
import type { HealthStatusResponse, ReadinessStatusResponse, StaffLoginRequest } from './index';

describe('package public API smoke', () => {
  it('re-exports the generated operations and the handwritten runtime together', () => {
    expect(typeof healthCheck).toBe('function');
    expect(typeof healthReadiness).toBe('function');
    expect(typeof createBrowserApiClient).toBe('function');
    expect(typeof normalizeApiClientError).toBe('function');
    expect(typeof staffSessionCreate).toBe('function');
  });

  it('exposes the staff login request type on the public boundary', () => {
    const body: StaffLoginRequest = { email: 'admin@example.test', password: 'secret' };
    expect(body.email).toBe('admin@example.test');
  });

  it('calls a generated operation through an injected instance with no real network', async () => {
    const captured: AxiosRequestConfig[] = [];
    const body: HealthStatusResponse = {
      service: 'api',
      status: 'ok',
      timestamp: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 1,
    };
    const instance = {
      request: (config: AxiosRequestConfig) => {
        captured.push(config);
        return Promise.resolve({ data: body });
      },
    } as unknown as AxiosInstance;

    const result = await healthCheck({ instance });

    expect(result).toEqual(body);
    expect(captured[0]).toMatchObject({ url: '/api/health', method: 'GET' });
  });

  it('exposes generated response types usable at strict compile time', () => {
    const readiness: ReadinessStatusResponse['status'] = 'ready';
    expect(readiness).toBe('ready');
  });
});
