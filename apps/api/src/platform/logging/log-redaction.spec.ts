import { REDACTED_MARKER, isSensitiveKey, normalizeKey, redactString } from './log-redaction';

describe('sensitive key matching', () => {
  it.each([
    'authorization',
    'Authorization',
    'proxy-authorization',
    'Cookie',
    'set-cookie',
    'password',
    'passwd',
    'pwd',
    'secret',
    'client_secret',
    'clientSecret',
    'token',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'id_token',
    'api_key',
    'apiKey',
    'x-api-key',
    'private_key',
    'credential',
    'credentials',
    'otp',
    'code_hash',
    'verification_code',
    'session',
    'sessionId',
  ])('treats %s as sensitive regardless of casing or separators', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['tokenCount', 'authorizationRequired', 'userId', 'orderId', 'requestId', 'route'])(
    'does not treat %s as sensitive',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );

  it('normalises to lowercase alphanumerics', () => {
    expect(normalizeKey('X-API_Key')).toBe('xapikey');
  });
});

describe('value redaction', () => {
  it('blanks a bearer token but keeps the surrounding text', () => {
    const result = redactString('called with Authorization: Bearer sk_live_abc123DEF456 done');
    expect(result).toContain('called with');
    expect(result).toContain('done');
    expect(result).not.toContain('sk_live_abc123DEF456');
    expect(result).toContain(REDACTED_MARKER);
  });

  it('blanks a postgres URL that carries a password', () => {
    const result = redactString('ECONNREFUSED postgres://admin:hunter2@db.internal:5432/app');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('admin:hunter2');
    expect(result).toContain(REDACTED_MARKER);
  });

  it('blanks a JWT-like token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N';
    expect(redactString(`token ${jwt}`)).not.toContain(jwt);
  });

  it('blanks a PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----';
    const result = redactString(`key=${pem}`);
    expect(result).not.toContain('MIIEabc');
    expect(result).toContain(REDACTED_MARKER);
  });

  it('blanks an inline password assignment', () => {
    expect(redactString('password=hunter2 and more')).not.toContain('hunter2');
    expect(redactString('token: abcd1234efgh')).not.toContain('abcd1234efgh');
  });

  describe('false positives', () => {
    it.each([
      'the authorization workflow completed',
      'GET /api/orders/9f8c2b1a-0000-4a5b-9c3d-1e2f3a4b5c6d',
      'tokenCount was 42',
      'https://cdn.example.com/assets/logo.png',
      'user a:b@example transfer',
    ])('leaves benign string %s unchanged', (value) => {
      expect(redactString(value)).toBe(value);
    });
  });
});
