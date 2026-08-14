/**
 * APP4 opaque-secret primitives (`APP4-P01`, `ADR-APP4-001` §5).
 *
 * The unbiasedness of the verification code is proven **structurally** — by
 * feeding an exact byte sequence through the injected seam and asserting which
 * bytes are rejected — rather than statistically. A distribution test over
 * millions of draws would be slow, flaky, and would still only measure what the
 * rejection rule already guarantees by construction.
 */
import { createHmac, randomBytes } from 'node:crypto';

import { digestSecret, fixedWidthEquals, verifySecretDigest } from './app4-secret-digest';
import {
  issueVerificationCode,
  REJECTION_THRESHOLD,
  VERIFICATION_CODE_LENGTH,
} from './verification-code.issuer';
import {
  isWellFormedSecureLinkToken,
  issueSecureLinkToken,
  SECURE_LINK_TOKEN_BYTES,
  SECURE_LINK_TOKEN_LENGTH,
} from './secure-link-token.issuer';

/** Synthetic peppers. Never a real operator value. */
const PEPPER_A = 'test-pepper-a-0000000000000000000';
const PEPPER_B = 'test-pepper-b-0000000000000000000';

/** A seam that replays an exact byte script, so a code becomes deterministic. */
function scriptedRandom(...script: number[]): (size: number) => Buffer {
  let cursor = 0;
  return (size: number) => {
    const slice = script.slice(cursor, cursor + size);
    cursor += size;
    return Buffer.from(slice);
  };
}

describe('issueVerificationCode', () => {
  it('returns exactly six decimal digits', () => {
    for (let i = 0; i < 20; i += 1) {
      const code = issueVerificationCode();
      expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('keeps a leading zero, because a code is a string and not a number', () => {
    // Bytes 0,1,2,3,4,5 map to digits 0..5 with no rejection.
    expect(issueVerificationCode(scriptedRandom(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11))).toBe(
      '012345',
    );
    // Why the return type is a string: a numeric round-trip loses the zero.
    expect(String(Number('012345'))).not.toBe('012345');
  });

  it('rejects biased bytes instead of folding them in', () => {
    // 250..255 are the six bytes that would make digits 0-5 more likely than
    // 6-9 under a bare `% 10`. Each must be skipped, not used.
    const code = issueVerificationCode(
      scriptedRandom(250, 251, 252, 253, 254, 255, 9, 8, 7, 6, 5, 4),
    );
    expect(code).toBe('987654');
  });

  it('maps an accepted byte by its remainder', () => {
    expect(issueVerificationCode(scriptedRandom(19, 28, 37, 46, 55, 64, 0, 0, 0, 0, 0, 0))).toBe(
      '987654',
    );
  });

  it('uses 250 as the rejection threshold — the largest multiple of ten in a byte', () => {
    expect(REJECTION_THRESHOLD).toBe(250);
    expect(REJECTION_THRESHOLD % 10).toBe(0);
    expect(REJECTION_THRESHOLD + 10).toBeGreaterThan(255);
  });

  it('fails closed rather than looping forever on a source that only rejects', () => {
    const alwaysRejected = (size: number) => Buffer.alloc(size, 255);
    expect(() => issueVerificationCode(alwaysRejected)).toThrow(/randomness budget/);
  });

  it('does not use Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    issueVerificationCode();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('issueSecureLinkToken', () => {
  it('encodes 32 CSPRNG bytes as unpadded base64url', () => {
    const token = issueSecureLinkToken();
    expect(token).toHaveLength(SECURE_LINK_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
  });

  it('decodes back to at least 256 bits of entropy', () => {
    expect(Buffer.from(issueSecureLinkToken(), 'base64url')).toHaveLength(SECURE_LINK_TOKEN_BYTES);
    expect(SECURE_LINK_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(256);
  });

  it('is not deterministic', () => {
    const tokens = new Set([
      issueSecureLinkToken(),
      issueSecureLinkToken(),
      issueSecureLinkToken(),
    ]);
    expect(tokens.size).toBe(3);
  });

  it('round-trips an exact byte script, so the encoding is pinned', () => {
    const bytes = Array.from({ length: SECURE_LINK_TOKEN_BYTES }, (_, i) => i);
    const token = issueSecureLinkToken(scriptedRandom(...bytes));
    expect(Buffer.from(token, 'base64url')).toEqual(Buffer.from(bytes));
    expect(isWellFormedSecureLinkToken(token)).toBe(true);
  });

  it('refuses a source that returns too few bytes rather than minting a weak token', () => {
    expect(() => issueSecureLinkToken(() => randomBytes(16))).toThrow(/32 random bytes/);
  });

  it('accepts only the 43-character base64url form', () => {
    expect(isWellFormedSecureLinkToken(issueSecureLinkToken())).toBe(true);
    expect(isWellFormedSecureLinkToken('short')).toBe(false);
    expect(isWellFormedSecureLinkToken('A'.repeat(44))).toBe(false);
    expect(isWellFormedSecureLinkToken(`${'A'.repeat(42)}+`)).toBe(false);
  });
});

describe('digestSecret / verifySecretDigest', () => {
  const secret = 'a-raw-secret';

  it('is HMAC-SHA-256 keyed by the pepper, not a prefixed hash', () => {
    expect(digestSecret(PEPPER_A, secret)).toBe(
      createHmac('sha256', PEPPER_A).update(secret, 'utf8').digest('base64'),
    );
  });

  it('is deterministic for the same secret and pepper', () => {
    expect(digestSecret(PEPPER_A, secret)).toBe(digestSecret(PEPPER_A, secret));
  });

  it('differs when the pepper differs', () => {
    expect(digestSecret(PEPPER_A, secret)).not.toBe(digestSecret(PEPPER_B, secret));
  });

  it('differs when the secret differs', () => {
    expect(digestSecret(PEPPER_A, secret)).not.toBe(digestSecret(PEPPER_A, 'another-secret'));
  });

  it('verifies a correct secret', () => {
    expect(verifySecretDigest(PEPPER_A, secret, digestSecret(PEPPER_A, secret))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifySecretDigest(PEPPER_A, 'wrong', digestSecret(PEPPER_A, secret))).toBe(false);
  });

  it('rejects a correct secret presented under the wrong pepper', () => {
    expect(verifySecretDigest(PEPPER_B, secret, digestSecret(PEPPER_A, secret))).toBe(false);
  });

  it.each([
    ['', 'malformed'],
    ['not-base64!!', 'malformed'],
    ['QQ', 'short'],
  ])('fails safely on a %s stored digest instead of throwing', (storedDigest) => {
    expect(() => verifySecretDigest(PEPPER_A, secret, storedDigest)).not.toThrow();
    expect(verifySecretDigest(PEPPER_A, secret, storedDigest)).toBe(false);
  });

  it('rejects an empty presented secret', () => {
    expect(verifySecretDigest(PEPPER_A, '', digestSecret(PEPPER_A, secret))).toBe(false);
  });

  it('compares unequal-length values without throwing, which timingSafeEqual alone does not', () => {
    expect(() => fixedWidthEquals('a', 'a-much-longer-value')).not.toThrow();
    expect(fixedWidthEquals('a', 'a-much-longer-value')).toBe(false);
    expect(fixedWidthEquals('same', 'same')).toBe(true);
  });

  it('issues and verifies a real verification code end to end', () => {
    const code = issueVerificationCode();
    expect(verifySecretDigest(PEPPER_A, code, digestSecret(PEPPER_A, code))).toBe(true);
    expect(verifySecretDigest(PEPPER_A, '000000', digestSecret(PEPPER_A, `${code}1`))).toBe(false);
  });

  it('issues and verifies a real secure-link token end to end', () => {
    const token = issueSecureLinkToken();
    expect(verifySecretDigest(PEPPER_B, token, digestSecret(PEPPER_B, token))).toBe(true);
  });
});
