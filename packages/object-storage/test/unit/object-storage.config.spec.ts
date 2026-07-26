import {
  describeObjectStorageConfig,
  loadObjectStorageConfig,
  ObjectStorageConfigError,
} from '../../src/index';

const SECRET = 'local-only-secret-value-not-a-real-key';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    OBJECT_STORAGE_PROVIDER: 's3',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'local-access-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: SECRET,
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ORIGINALS_BUCKET: 'embroidery-test-originals',
    OBJECT_STORAGE_DERIVATIVES_BUCKET: 'embroidery-test-derivatives',
    ...overrides,
  };
}

describe('loadObjectStorageConfig', () => {
  it('parses a complete local configuration', () => {
    const config = loadObjectStorageConfig(env());

    expect(config).toEqual({
      provider: 's3',
      environment: 'test',
      endpoint: 'http://127.0.0.1:9000',
      region: 'us-east-1',
      forcePathStyle: true,
      originalsBucket: 'embroidery-test-originals',
      derivativesBucket: 'embroidery-test-derivatives',
      credentials: { accessKeyId: 'local-access-key', secretAccessKey: SECRET },
    });
  });

  it('omits the endpoint entirely when unset outside development', () => {
    const config = loadObjectStorageConfig(env({ OBJECT_STORAGE_ENDPOINT: undefined }));

    // Omitted, not `undefined`: an explicit undefined would suppress the SDK's
    // own regional endpoint resolution.
    expect('endpoint' in config).toBe(false);
  });

  it('requires an endpoint in development so the SDK cannot address real AWS', () => {
    expect(() =>
      loadObjectStorageConfig(env({ NODE_ENV: 'development', OBJECT_STORAGE_ENDPOINT: undefined })),
    ).toThrow(/Missing OBJECT_STORAGE_ENDPOINT/);
  });

  it('falls back to the default credential provider chain when both are absent', () => {
    const config = loadObjectStorageConfig(
      env({
        OBJECT_STORAGE_ACCESS_KEY_ID: undefined,
        OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined,
      }),
    );

    expect('credentials' in config).toBe(false);
  });

  it.each([
    ['OBJECT_STORAGE_ACCESS_KEY_ID', { OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined }],
    ['OBJECT_STORAGE_SECRET_ACCESS_KEY', { OBJECT_STORAGE_ACCESS_KEY_ID: undefined }],
  ])('rejects a half-configured credential pair (%s present)', (_label, overrides) => {
    expect(() => loadObjectStorageConfig(env(overrides))).toThrow(ObjectStorageConfigError);
  });

  it.each(['1', '0', 'yes', 'TRUE', 'True', ''])(
    'rejects the non-literal force-path-style value %p',
    (value) => {
      expect(() =>
        loadObjectStorageConfig(env({ OBJECT_STORAGE_FORCE_PATH_STYLE: value })),
      ).toThrow(ObjectStorageConfigError);
    },
  );

  it.each([
    ['false', false],
    ['true', true],
  ])('accepts the exact literal %p', (raw, expected) => {
    expect(
      loadObjectStorageConfig(env({ OBJECT_STORAGE_FORCE_PATH_STYLE: raw })).forcePathStyle,
    ).toBe(expected);
  });

  it.each([
    ['ab', 'too short'],
    ['Embroidery-Originals', 'uppercase'],
    ['-leading-dash', 'leading dash'],
    ['trailing-dash-', 'trailing dash'],
    ['double..dot', 'adjacent dots'],
    ['192.168.0.1', 'IP address form'],
  ])('rejects the invalid bucket name %p (%s)', (bucket) => {
    expect(() => loadObjectStorageConfig(env({ OBJECT_STORAGE_ORIGINALS_BUCKET: bucket }))).toThrow(
      ObjectStorageConfigError,
    );
  });

  it('rejects identical originals and derivatives buckets', () => {
    expect(() =>
      loadObjectStorageConfig(
        env({ OBJECT_STORAGE_DERIVATIVES_BUCKET: 'embroidery-test-originals' }),
      ),
    ).toThrow(/must be distinct/);
  });

  it.each([
    'OBJECT_STORAGE_PROVIDER',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_FORCE_PATH_STYLE',
    'OBJECT_STORAGE_ORIGINALS_BUCKET',
    'OBJECT_STORAGE_DERIVATIVES_BUCKET',
  ])('rejects a missing %s', (name) => {
    expect(() => loadObjectStorageConfig(env({ [name]: undefined }))).toThrow(
      ObjectStorageConfigError,
    );
  });

  it('rejects a provider other than s3', () => {
    expect(() => loadObjectStorageConfig(env({ OBJECT_STORAGE_PROVIDER: 'minio' }))).toThrow(
      /expected s3/,
    );
  });

  it.each(['not-a-url', 'ftp://storage.invalid', 's3://bucket'])(
    'rejects the unusable endpoint %p',
    (endpoint) => {
      expect(() => loadObjectStorageConfig(env({ OBJECT_STORAGE_ENDPOINT: endpoint }))).toThrow(
        ObjectStorageConfigError,
      );
    },
  );

  it('rejects credentials embedded in the endpoint URL', () => {
    expect(() =>
      loadObjectStorageConfig(
        env({ OBJECT_STORAGE_ENDPOINT: `http://user:${SECRET}@127.0.0.1:9000` }),
      ),
    ).toThrow(/must not be embedded/);
  });

  it('rejects an unknown NODE_ENV rather than defaulting silently', () => {
    expect(() => loadObjectStorageConfig(env({ NODE_ENV: 'staging' }))).toThrow(/Invalid NODE_ENV/);
  });

  it('never echoes the secret in any thrown configuration message', () => {
    const cases: Array<Record<string, string | undefined>> = [
      { OBJECT_STORAGE_ACCESS_KEY_ID: undefined },
      { OBJECT_STORAGE_FORCE_PATH_STYLE: 'nope' },
      { OBJECT_STORAGE_ORIGINALS_BUCKET: 'BAD' },
      { OBJECT_STORAGE_ENDPOINT: `http://user:${SECRET}@127.0.0.1:9000` },
    ];

    for (const overrides of cases) {
      let message = '';
      try {
        loadObjectStorageConfig(env(overrides));
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(SECRET);
    }
  });
});

describe('describeObjectStorageConfig', () => {
  it('omits the secret and reduces the credential pair to a presence marker', () => {
    const described = describeObjectStorageConfig(loadObjectStorageConfig(env()));

    expect(JSON.stringify(described)).not.toContain(SECRET);
    expect(JSON.stringify(described)).not.toContain('local-access-key');
    expect(described['credentials']).toBe('<configured>');
  });

  it('reports the default credential chain when no pair is configured', () => {
    const described = describeObjectStorageConfig(
      loadObjectStorageConfig(
        env({
          OBJECT_STORAGE_ACCESS_KEY_ID: undefined,
          OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined,
          OBJECT_STORAGE_ENDPOINT: undefined,
        }),
      ),
    );

    expect(described['credentials']).toBe('<default provider chain>');
    expect(described['endpoint']).toBe('<provider default>');
  });
});
