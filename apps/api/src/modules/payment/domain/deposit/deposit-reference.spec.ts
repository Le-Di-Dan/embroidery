/**
 * The DEPOSIT transfer reference (`APP7-G01` §4, `APP7-B03` §15).
 *
 * Docker-free: no database, no container, no network.
 */
import { HUMAN_CODE_ALPHABET, generateHumanCode } from '@embroidery/domain-types';

import {
  DEPOSIT_REFERENCE_KIND_CODE,
  DEPOSIT_REFERENCE_PATTERN,
  depositTransferReference,
} from './deposit-reference';

/** The exact example `APP7-G01` §4 and the B03 directive both spell out. */
const EXAMPLE_ORDER_CODE = 'ORD-7K3MPQ2XVD';
const EXAMPLE_REFERENCE = 'ORD7K3MPQ2XVDDC';

describe('APP7-B03 — the deposit transfer reference', () => {
  it('is the G01 format, not the raw order code', () => {
    // The earlier planning statement made the order code itself the memo. The
    // accepted G01 completion superseded it, and this is that difference: the
    // hyphen is gone and the kind code is appended.
    expect(depositTransferReference(EXAMPLE_ORDER_CODE)).toBe(EXAMPLE_REFERENCE);
    expect(depositTransferReference(EXAMPLE_ORDER_CODE)).not.toBe(EXAMPLE_ORDER_CODE);
  });

  it('is 15 uppercase alphanumeric characters and matches the locked pattern', () => {
    const reference = depositTransferReference(EXAMPLE_ORDER_CODE);
    expect(reference).toHaveLength(15);
    expect(reference).toMatch(/^[A-Z0-9]{15}$/);
    expect(reference).toMatch(DEPOSIT_REFERENCE_PATTERN);
  });

  it('carries the DC suffix, and APP7 exposes no RM flow', () => {
    expect(DEPOSIT_REFERENCE_KIND_CODE).toBe('DC');
    expect(depositTransferReference(EXAMPLE_ORDER_CODE).endsWith('DC')).toBe(true);
    // There is no kind parameter on the deriving function, so no APP7 caller can
    // ask for the remaining-payment reference. `RM` is APP9's, and reserving it
    // is not implementing it.
    expect(depositTransferReference).toHaveLength(1);
    expect(depositTransferReference(EXAMPLE_ORDER_CODE)).not.toContain('RM');
  });

  it('is deterministic — the same order derives the same reference every time', () => {
    const first = depositTransferReference(EXAMPLE_ORDER_CODE);
    const second = depositTransferReference(EXAMPLE_ORDER_CODE);
    const third = depositTransferReference(EXAMPLE_ORDER_CODE);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('preserves the order code body exactly, so the two reconcile by position', () => {
    for (let draw = 0; draw < 25; draw += 1) {
      const code = generateHumanCode('ORD-', drawBytes);
      const reference = depositTransferReference(code);
      expect(reference.slice(0, 3)).toBe('ORD');
      expect(reference.slice(3, 13)).toBe(code.slice(4));
      expect(reference.slice(13)).toBe('DC');
      expect(reference).toMatch(DEPOSIT_REFERENCE_PATTERN);
    }
  });

  it('carries no customer fact — every character comes from the code and the kind', () => {
    const reference = depositTransferReference(EXAMPLE_ORDER_CODE);
    const allowed = new Set([...`ORD${HUMAN_CODE_ALPHABET}DC`]);
    for (const character of reference) {
      expect(allowed.has(character)).toBe(true);
    }
  });

  it.each([
    ['a request code', 'REQ-7K3MPQ2XVD'],
    ['a quotation code', 'QUO-7K3MPQ2XVD'],
    ['a body that is too short', 'ORD-7K3MPQ2XV'],
    ['a body using an excluded character', 'ORD-7K3MPQ2XV0'],
    ['a code with no hyphen', 'ORD7K3MPQ2XVD'],
    ['a lowercase code', 'ord-7k3mpq2xvd'],
    ['an empty string', ''],
  ])('refuses %s rather than deriving a malformed memo', (_case, code) => {
    expect(() => depositTransferReference(code)).toThrow();
  });
});

/** Deterministic bytes, so the property above is provable without randomness. */
let seed = 7;
function drawBytes(size: number): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < size; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    bytes.push(seed % 251);
  }
  return bytes;
}
