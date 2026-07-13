import { HTTP_TIMEOUT_MS } from '../config/http-constants';
import { createBrowserApiClient } from './create-browser-api-client';
import { createServerApiClient } from './create-server-api-client';

const SAME_ORIGIN_BASE_PATH = '/api';
const INTERNAL_BASE_URL = 'http://api:4000/api';

describe('createBrowserApiClient', () => {
  it('accepts the same-origin gateway base path', () => {
    const client = createBrowserApiClient({ baseUrl: SAME_ORIGIN_BASE_PATH });
    expect(client.defaults.baseURL).toBe(SAME_ORIGIN_BASE_PATH);
    expect(client.defaults.timeout).toBe(HTTP_TIMEOUT_MS.browser);
  });

  it('still accepts an absolute URL for controlled non-gateway setups', () => {
    const client = createBrowserApiClient({ baseUrl: 'http://localhost:4000/api' });
    expect(client.defaults.baseURL).toBe('http://localhost:4000/api');
  });

  it('honors an explicit timeout override', () => {
    const client = createBrowserApiClient({ baseUrl: SAME_ORIGIN_BASE_PATH, timeoutMs: 1_000 });
    expect(client.defaults.timeout).toBe(1_000);
  });

  it('rejects empty and malformed base URLs', () => {
    expect(() => createBrowserApiClient({ baseUrl: '  ' })).toThrow(/same-origin path/i);
    expect(() => createBrowserApiClient({ baseUrl: 'api' })).toThrow(/same-origin path/i);
    expect(() => createBrowserApiClient({ baseUrl: 'ftp://api' })).toThrow(/same-origin path/i);
  });
});

describe('createServerApiClient', () => {
  it('accepts an absolute internal service URL and applies the stricter timeout', () => {
    const client = createServerApiClient({ baseUrl: INTERNAL_BASE_URL });
    expect(client.defaults.baseURL).toBe(INTERNAL_BASE_URL);
    expect(client.defaults.timeout).toBe(HTTP_TIMEOUT_MS.server);
  });

  it('rejects relative paths because server code has no browser origin', () => {
    expect(() => createServerApiClient({ baseUrl: SAME_ORIGIN_BASE_PATH })).toThrow(
      /absolute internal http\(s\) URL/i,
    );
    expect(() => createServerApiClient({ baseUrl: '' })).toThrow(/absolute internal/i);
  });

  it('sends JSON accept headers', () => {
    const client = createServerApiClient({ baseUrl: INTERNAL_BASE_URL });
    expect(client.defaults.headers['Accept']).toBe('application/json');
  });
});
