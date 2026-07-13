import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createBrowserApiClient } from './create-browser-api-client';
import { createServerApiClient } from './create-server-api-client';

const BASE_URL = 'http://localhost:4000';

describe('createBrowserApiClient', () => {
  it('applies the base URL and the browser default timeout', () => {
    const client = createBrowserApiClient({ baseUrl: BASE_URL });
    expect(client.defaults.baseURL).toBe(BASE_URL);
    expect(client.defaults.timeout).toBe(HTTP_TIMEOUT_MS.browser);
  });

  it('honors an explicit timeout override', () => {
    const client = createBrowserApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000 });
    expect(client.defaults.timeout).toBe(1_000);
  });

  it('rejects an empty base URL', () => {
    expect(() => createBrowserApiClient({ baseUrl: '  ' })).toThrow(/base URL/i);
  });
});

describe('createServerApiClient', () => {
  it('applies the stricter server default timeout', () => {
    const client = createServerApiClient({ baseUrl: BASE_URL });
    expect(client.defaults.baseURL).toBe(BASE_URL);
    expect(client.defaults.timeout).toBe(HTTP_TIMEOUT_MS.server);
  });

  it('sends JSON accept headers', () => {
    const client = createServerApiClient({ baseUrl: BASE_URL });
    expect(client.defaults.headers['Accept']).toBe('application/json');
  });
});
