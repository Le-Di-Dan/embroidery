import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { apiRequest } from './api-request.mutator';

interface RecordingInstance {
  instance: AxiosInstance;
  calls: AxiosRequestConfig[];
}

function recordingInstance(data: unknown): RecordingInstance {
  const calls: AxiosRequestConfig[] = [];
  const request = (config: AxiosRequestConfig): Promise<{ data: unknown }> => {
    calls.push(config);
    return Promise.resolve({ data });
  };
  return { instance: { request } as unknown as AxiosInstance, calls };
}

describe('apiRequest mutator', () => {
  it('routes through the caller-provided Axios instance and returns the body', async () => {
    const { instance, calls } = recordingInstance({ status: 'ok' });

    const result = await apiRequest<{ status: string }>(
      { url: '/api/health', method: 'GET' },
      { instance },
    );

    expect(result).toEqual({ status: 'ok' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/api/health', method: 'GET' });
  });

  it('merges per-call config over the generated request config', async () => {
    const { instance, calls } = recordingInstance(null);
    const controller = new AbortController();

    await apiRequest(
      { url: '/api/health', method: 'GET' },
      { instance, config: { signal: controller.signal, headers: { 'X-Test': '1' } } },
    );

    expect(calls[0]).toMatchObject({
      url: '/api/health',
      method: 'GET',
      headers: { 'X-Test': '1' },
    });
    expect(calls[0]?.signal).toBe(controller.signal);
  });

  it('does not inject an X-Request-ID (gateway/API own that contract)', async () => {
    const { instance, calls } = recordingInstance(null);

    await apiRequest({ url: '/api/health', method: 'GET' }, { instance });

    const headers = (calls[0]?.headers ?? {}) as Record<string, unknown>;
    const headerKeys = Object.keys(headers).map((key) => key.toLowerCase());
    expect(headerKeys).not.toContain('x-request-id');
    expect(headerKeys).not.toContain('x-correlation-id');
  });

  it('throws a clear error when no instance is provided', () => {
    expect(() => apiRequest({ url: '/api/health', method: 'GET' })).toThrow(
      /without an Axios instance/,
    );
  });
});
