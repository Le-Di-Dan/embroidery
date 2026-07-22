import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  it('applies development defaults when nothing is set', () => {
    expect(loadAppConfig({})).toEqual({
      environment: 'development',
      port: 4000,
      docsEnabled: true,
    });
  });

  it('reads a valid port and environment', () => {
    expect(loadAppConfig({ NODE_ENV: 'production', API_PORT: '8080' })).toEqual({
      environment: 'production',
      port: 8080,
      docsEnabled: false,
    });
  });

  describe('API_DOCS_ENABLED', () => {
    it('never exposes the docs by default in production', () => {
      expect(loadAppConfig({ NODE_ENV: 'production' }).docsEnabled).toBe(false);
    });

    it('enables the docs by default outside production', () => {
      expect(loadAppConfig({ NODE_ENV: 'development' }).docsEnabled).toBe(true);
      expect(loadAppConfig({ NODE_ENV: 'test' }).docsEnabled).toBe(true);
    });

    it('respects an explicit opt-in, including in production', () => {
      expect(loadAppConfig({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).docsEnabled).toBe(
        true,
      );
    });

    it('respects an explicit opt-out outside production', () => {
      expect(
        loadAppConfig({ NODE_ENV: 'development', API_DOCS_ENABLED: 'false' }).docsEnabled,
      ).toBe(false);
    });

    it('rejects an ambiguous value instead of guessing', () => {
      expect(() => loadAppConfig({ API_DOCS_ENABLED: 'yes' })).toThrow(/Invalid API_DOCS_ENABLED/);
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
