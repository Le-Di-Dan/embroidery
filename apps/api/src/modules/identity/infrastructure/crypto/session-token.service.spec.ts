import { createHash } from 'node:crypto';

import { SessionTokenService, TOKEN_BYTES, hashToken } from './session-token.service';

describe('SessionTokenService', () => {
  it('issues a 256-bit base64url token and its sha256 hash', () => {
    const bytes = Buffer.alloc(TOKEN_BYTES, 1);
    const service = new SessionTokenService(() => bytes);
    const issued = service.issue();

    expect(issued.rawToken).toBe(bytes.toString('base64url'));
    expect(issued.tokenHash).toBe(createHash('sha256').update(issued.rawToken).digest('base64'));
    // base64url carries no +, / or = padding.
    expect(issued.rawToken).not.toMatch(/[+/=]/);
  });

  it('hashes a presented token identically to issuance', () => {
    const service = new SessionTokenService();
    const issued = service.issue();
    expect(service.hash(issued.rawToken)).toBe(issued.tokenHash);
    expect(hashToken(issued.rawToken)).toBe(issued.tokenHash);
  });

  it('produces different raw tokens across issuances (CSPRNG default)', () => {
    const service = new SessionTokenService();
    expect(service.issue().rawToken).not.toBe(service.issue().rawToken);
  });
});
