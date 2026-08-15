/**
 * Tests for the two H02 helpers with real rules rather than plumbing: the
 * evidence projection that must never emit a secret-bearing column, and the
 * comparison helpers whose whole purpose is to fail without printing operands.
 */
import { describe, expect, it } from '@jest/globals';

import { projectSafe } from './db-evidence.mjs';
import {
  assertByteFieldsEqual,
  assertSecretDifferent,
  assertSecretEqual,
  compareFields,
  scanTextsForSecret,
} from './secret-compare.mjs';

describe('projectSafe', () => {
  it('withholds every secret-bearing column and reports its presence as a boolean', () => {
    const safe = projectSafe({
      id: 'chal_1',
      status: 'PENDING',
      code_hash: 'a-digest',
      token_hash: null,
      envelope_ciphertext: 'x',
      iv: 'y',
    });
    expect(safe).toEqual({
      id: 'chal_1',
      status: 'PENDING',
      hasCodeHash: true,
      hasTokenHash: false,
      hasEnvelopeCiphertext: true,
      hasIv: true,
    });
  });

  it('withholds a newly named digest column without being told about it', () => {
    // The point of a denylist: a column added tomorrow is withheld today.
    const safe = projectSafe({ id: 'x', future_secret_material: 'value' });
    expect(safe).toEqual({ id: 'x', hasFutureSecretMaterial: true });
  });
});

describe('secret comparisons', () => {
  it('accepts equal and different secrets', () => {
    expect(assertSecretEqual('same', 'same', 'retry')).toBe(true);
    expect(assertSecretDifferent('one', 'two', 'resend')).toBe(true);
  });

  it('never puts an operand in the failure message', () => {
    const secret = 'SUPER-SECRET-VALUE';
    expect(() => assertSecretEqual(secret, 'other', 'retry')).toThrow(/equal = false/);
    try {
      assertSecretEqual(secret, 'other', 'retry');
    } catch (error) {
      expect(error.message.includes(secret)).toBe(false);
      expect(error.message.includes('other')).toBe(false);
    }
  });

  it('names only the envelope fields that differ', () => {
    const left = { iv: 'a', ciphertext: 'b', authTag: 'c' };
    const right = { iv: 'a', ciphertext: 'DIFFERENT', authTag: 'c' };
    expect(compareFields(left, right, ['iv', 'ciphertext'])).toEqual({
      iv: true,
      ciphertext: false,
    });
    try {
      assertByteFieldsEqual(left, right, ['iv', 'ciphertext', 'authTag'], 'replay envelope');
    } catch (error) {
      expect(error.message).toContain('ciphertext');
      expect(error.message.includes('DIFFERENT')).toBe(false);
    }
  });

  it('reports leak surfaces by name and never the match', () => {
    const result = scanTextsForSecret('code-123', {
      apiLog: 'nothing here',
      workerLog: 'delivered code-123 somewhere',
    });
    expect(result).toEqual({ present: true, surfaces: ['workerLog'] });
  });
});
