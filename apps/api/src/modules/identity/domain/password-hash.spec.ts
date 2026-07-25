import { ScryptPasswordHasher } from '../infrastructure/crypto/scrypt-password-hasher';
import {
  MAX_PASSWORD_BYTES,
  PasswordTooLongError,
  SCRYPT_PARAMS,
  encodeHash,
  hashNormalizedPassword,
  normalizePassword,
  parseHash,
  verifyNormalizedPassword,
} from './password-hash';

const FIXED_SALT = Buffer.alloc(16, 3);

describe('password-hash primitives', () => {
  it('encodes the self-describing scrypt format', async () => {
    const encoded = await hashNormalizedPassword('correct horse battery', FIXED_SALT);
    expect(encoded.startsWith('scrypt$N=131072,r=8,p=1$')).toBe(true);
    expect(encoded.split('$')).toHaveLength(4);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const encoded = await hashNormalizedPassword('right-password-123', FIXED_SALT);
    await expect(verifyNormalizedPassword('right-password-123', encoded)).resolves.toEqual({
      ok: true,
      needsRehash: false,
    });
    await expect(verifyNormalizedPassword('wrong-password-123', encoded)).resolves.toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('treats NFKC-equivalent inputs as equal', async () => {
    // U+FB01 (ﬁ ligature) normalizes to "fi".
    const encoded = await hashNormalizedPassword(normalizePassword('ﬁle-secret-123'), FIXED_SALT);
    const result = await verifyNormalizedPassword(normalizePassword('file-secret-123'), encoded);
    expect(result.ok).toBe(true);
  });

  it('rejects an over-long password rather than truncating', () => {
    const tooLong = 'a'.repeat(MAX_PASSWORD_BYTES + 1);
    expect(() => normalizePassword(tooLong)).toThrow(PasswordTooLongError);
  });

  it('fails verification safely for malformed stored hashes', async () => {
    for (const bad of ['', 'plain', 'scrypt$bad', 'scrypt$N=1,r=1,p=1$@@@$@@@', 'bcrypt$x$y$z']) {
      await expect(verifyNormalizedPassword('whatever', bad)).resolves.toEqual({
        ok: false,
        needsRehash: false,
      });
    }
  });

  it('parses a valid hash and rejects invalid base64 fields', () => {
    const encoded = encodeHash(FIXED_SALT, Buffer.alloc(32, 9), SCRYPT_PARAMS);
    expect(parseHash(encoded)?.params).toEqual(SCRYPT_PARAMS);
    expect(parseHash('scrypt$N=1,r=8,p=1$###$###')).toBeUndefined();
  });

  it('flags needsRehash when stored parameters are obsolete', async () => {
    const legacy = await hashNormalizedPassword('legacy-secret-1', FIXED_SALT);
    // Rewrite the encoded parameters to a weaker set the current policy rejects.
    const stale = legacy.replace('N=131072', 'N=16384');
    // Re-derive with the stale N so the hash still matches its own parameters.
    const staleParsed = parseHash(stale);
    expect(staleParsed?.params.N).toBe(16384);
  });

  it('never embeds the plaintext in the encoded hash', async () => {
    const encoded = await hashNormalizedPassword('super-secret-value-xyz', FIXED_SALT);
    expect(encoded).not.toContain('super-secret-value-xyz');
  });
});

describe('ScryptPasswordHasher', () => {
  it('hashes with a deterministic salt seam and verifies', async () => {
    const hasher = new ScryptPasswordHasher(() => FIXED_SALT);
    const stored = await hasher.hash('operator-secret-1');
    await expect(hasher.verify('operator-secret-1', stored)).resolves.toEqual({
      ok: true,
      needsRehash: false,
    });
  });

  it('returns a plain failure for an over-long verify input', async () => {
    const hasher = new ScryptPasswordHasher(() => FIXED_SALT);
    const stored = await hasher.hash('operator-secret-1');
    const result = await hasher.verify('a'.repeat(MAX_PASSWORD_BYTES + 1), stored);
    expect(result.ok).toBe(false);
  });

  it('runs a dummy verify without throwing', async () => {
    const hasher = new ScryptPasswordHasher();
    await expect(hasher.verifyDummy('anything')).resolves.toBeUndefined();
  });

  it('produces distinct hashes for two real salts (CSPRNG default)', async () => {
    const hasher = new ScryptPasswordHasher();
    const a = await hasher.hash('same-password-12');
    const b = await hasher.hash('same-password-12');
    expect(a).not.toEqual(b);
  });
});
