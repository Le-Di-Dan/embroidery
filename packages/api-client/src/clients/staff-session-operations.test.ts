import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { staffSessionCreate, staffSessionDelete } from '../generated/embroidery-api';

interface RecordingInstance {
  instance: AxiosInstance;
  calls: AxiosRequestConfig[];
}

/** Records requests and returns a 204-style empty body. */
function recordingInstance(): RecordingInstance {
  const calls: AxiosRequestConfig[] = [];
  const request = (config: AxiosRequestConfig): Promise<{ data: unknown }> => {
    calls.push(config);
    return Promise.resolve({ data: undefined });
  };
  return { instance: { request } as unknown as AxiosInstance, calls };
}

describe('generated staff session operations (FU-A08)', () => {
  it('sends the login body to POST /api/staff/session and resolves 204', async () => {
    const { instance, calls } = recordingInstance();

    const result = await staffSessionCreate(
      { email: 'admin@example.test', password: 'secret' },
      { instance },
    );

    expect(result).toBeUndefined();
    expect(calls[0]).toMatchObject({
      url: '/api/staff/session',
      method: 'POST',
      data: { email: 'admin@example.test', password: 'secret' },
    });
  });

  it('sends DELETE /api/staff/session for logout and resolves 204', async () => {
    const { instance, calls } = recordingInstance();

    const result = await staffSessionDelete({ instance });

    expect(result).toBeUndefined();
    expect(calls[0]).toMatchObject({ url: '/api/staff/session', method: 'DELETE' });
    // The generated logout takes no cookie/token argument — the browser runtime owns it.
    expect(calls[0]?.data).toBeUndefined();
  });
});
