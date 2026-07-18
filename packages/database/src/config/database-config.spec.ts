import { loadDatabaseConfig, redactUrl } from './database-config';

const VALID_URL = 'postgres://user:secret@localhost:5432/embroidery';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'development', DATABASE_URL: VALID_URL, ...overrides };
}

describe('loadDatabaseConfig', () => {
  it('accepts a well-formed development configuration', () => {
    const config = loadDatabaseConfig(env());
    expect(config.environment).toBe('development');
    expect(config.sslMode).toBe('disable');
    expect(config.expectedMajorVersion).toBe(16);
    expect(config.poolMax).toBe(10);
  });

  it('rejects a missing DATABASE_URL rather than defaulting to one', () => {
    expect(() => loadDatabaseConfig(env({ DATABASE_URL: undefined }))).toThrow(
      /Missing DATABASE_URL/,
    );
  });

  it.each([
    ['not-a-url', /not a parseable URL/],
    ['mysql://user:p@localhost:3306/db', /protocol/],
    ['postgres://user:p@localhost:5432', /no database name/],
    ['postgres://localhost:5432/db', /no user/],
  ])('rejects malformed DATABASE_URL %s', (url, expected) => {
    expect(() => loadDatabaseConfig(env({ DATABASE_URL: url }))).toThrow(expected);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadDatabaseConfig(env({ NODE_ENV: 'staging' }))).toThrow(/Invalid NODE_ENV/);
  });

  it('rejects an unknown SSL mode', () => {
    expect(() => loadDatabaseConfig(env({ DATABASE_SSL_MODE: 'maybe' }))).toThrow(
      /Invalid DATABASE_SSL_MODE/,
    );
  });

  it.each([['0'], ['-1'], ['abc'], ['1.5'], ['101']])(
    'rejects out-of-range DATABASE_POOL_MAX %s',
    (value) => {
      expect(() => loadDatabaseConfig(env({ DATABASE_POOL_MAX: value }))).toThrow(
        /Invalid DATABASE_POOL_MAX/,
      );
    },
  );

  describe('production safety', () => {
    const productionEnv = (overrides: Record<string, string> = {}) =>
      env({ NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full', ...overrides });

    it('refuses to run without TLS', () => {
      expect(() => loadDatabaseConfig(productionEnv({ DATABASE_SSL_MODE: 'disable' }))).toThrow(
        /not permitted when NODE_ENV=production/,
      );
    });

    it('refuses the documented development password', () => {
      expect(() =>
        loadDatabaseConfig(
          productionEnv({
            DATABASE_URL: 'postgres://user:embroidery_dev_password@db:5432/embroidery',
          }),
        ),
      ).toThrow(/development database password/);
    });

    it('accepts a hardened production configuration', () => {
      expect(loadDatabaseConfig(productionEnv()).sslMode).toBe('verify-full');
    });
  });
});

describe('redactUrl', () => {
  it('removes the password', () => {
    const redacted = redactUrl(VALID_URL);
    expect(redacted).not.toContain('secret');
    expect(redacted).toContain('localhost:5432');
  });

  it('does not echo an unparseable value, which could itself be a secret', () => {
    expect(redactUrl('postgres://user:secret@:::')).toBe('<unparseable database url>');
  });
});
