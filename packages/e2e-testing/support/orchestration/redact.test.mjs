import { describe, expect, it } from '@jest/globals';

import { redactRecord, redactUrl } from './redact.mjs';

describe('redaction', () => {
  it('hides credentials in a connection string', () => {
    const out = redactUrl('postgres://embroidery:secret_pw@localhost:5544/embroidery_db7_e2e');
    expect(out).not.toContain('secret_pw');
    expect(out).toContain('localhost:5544');
    expect(out).toContain('embroidery_db7_e2e');
  });

  it('returns a placeholder for an unparseable value', () => {
    expect(redactUrl('not a url')).toBe('[redacted-url]');
  });

  it('redacts secret-like keys and embedded credentials in a record', () => {
    const out = redactRecord({
      API_PORT: '4400',
      DATABASE_URL: 'postgres://u:p@localhost:5544/db',
      DATABASE_PASSWORD: 'p',
      token: 'abc',
    });
    expect(out.API_PORT).toBe('4400');
    expect(out.DATABASE_PASSWORD).toBe('***');
    expect(out.token).toBe('***');
    expect(out.DATABASE_URL).not.toContain(':p@');
  });
});
