import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  it('applies development defaults when nothing is set', () => {
    expect(loadAppConfig({})).toEqual({ environment: 'development', port: 4000 });
  });

  it('reads a valid port and environment', () => {
    expect(loadAppConfig({ NODE_ENV: 'production', API_PORT: '8080' })).toEqual({
      environment: 'production',
      port: 8080,
    });
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadAppConfig({ API_PORT: 'not-a-port' })).toThrow(/Invalid API_PORT/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadAppConfig({ API_PORT: '0' })).toThrow(/Invalid API_PORT/);
    expect(() => loadAppConfig({ API_PORT: '70000' })).toThrow(/Invalid API_PORT/);
  });

  it('rejects an unknown environment', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'staging' })).toThrow(/Invalid NODE_ENV/);
  });
});
