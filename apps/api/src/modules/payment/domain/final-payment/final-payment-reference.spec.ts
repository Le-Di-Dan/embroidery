/**
 * The `REMAINING` transfer reference (`APP7-G01` §4, `APP9-B02` §10).
 *
 * The deposit's own suite asserts that `depositTransferReference` has arity 1
 * and never produces `RM`. This is its counterpart: the same locked format, the
 * kind code APP7 reserved, and — the property that matters on a bank statement —
 * that the two are never equal for the same order.
 *
 * Docker-free: no database, no container, no network.
 */
import { HUMAN_CODE_ALPHABET, generateHumanCode } from '@embroidery/domain-types';

import {
  DEPOSIT_REFERENCE_KIND_CODE,
  depositTransferReference,
} from '../deposit/deposit-reference';
import {
  REMAINING_REFERENCE_KIND_CODE,
  REMAINING_REFERENCE_PATTERN,
  remainingTransferReference,
} from './final-payment-reference';

/** The exact example `APP7-G01` §4 spells out, with the other kind code. */
const EXAMPLE_ORDER_CODE = 'ORD-7K3MPQ2XVD';
const EXAMPLE_REFERENCE = 'ORD7K3MPQ2XVDRM';

describe('APP9-B02 — the final-payment transfer reference', () => {
  it('is the G01 format with the reserved RM kind code', () => {
    expect(remainingTransferReference(EXAMPLE_ORDER_CODE)).toBe(EXAMPLE_REFERENCE);
    expect(REMAINING_REFERENCE_KIND_CODE).toBe('RM');
  });

  it('is 15 uppercase alphanumeric characters and matches the locked pattern', () => {
    const reference = remainingTransferReference(EXAMPLE_ORDER_CODE);
    expect(reference).toHaveLength(15);
    expect(reference).toMatch(/^[A-Z0-9]{15}$/);
    expect(reference).toMatch(REMAINING_REFERENCE_PATTERN);
  });

  it('is never the deposit memo for the same order, which is the whole point', () => {
    // One order carries both obligations at once (CST-039). An operator
    // reconciling a bank statement, and APP9-B03 after them, can only tell which
    // one a transfer paid because these two differ.
    const remaining = remainingTransferReference(EXAMPLE_ORDER_CODE);
    const deposit = depositTransferReference(EXAMPLE_ORDER_CODE);
    expect(remaining).not.toBe(deposit);
    expect(remaining.slice(0, 13)).toBe(deposit.slice(0, 13));
    expect(remaining.slice(13)).toBe(REMAINING_REFERENCE_KIND_CODE);
    expect(deposit.slice(13)).toBe(DEPOSIT_REFERENCE_KIND_CODE);
  });

  it('takes the order code and nothing else, so no caller can choose the kind', () => {
    // The mirror of the deposit suite's arity assertion. A kind parameter here
    // would let this surface derive `DC` and address the deposit obligation.
    expect(remainingTransferReference).toHaveLength(1);
    expect(remainingTransferReference(EXAMPLE_ORDER_CODE)).not.toContain('DC');
  });

  it('is deterministic — the same order derives the same reference every time', () => {
    const first = remainingTransferReference(EXAMPLE_ORDER_CODE);
    expect(remainingTransferReference(EXAMPLE_ORDER_CODE)).toBe(first);
    expect(remainingTransferReference(EXAMPLE_ORDER_CODE)).toBe(first);
  });

  it('preserves the order code body exactly, so the two reconcile by position', () => {
    for (let draw = 0; draw < 25; draw += 1) {
      const code = generateHumanCode('ORD-', drawBytes);
      const reference = remainingTransferReference(code);
      expect(reference.slice(0, 3)).toBe('ORD');
      expect(reference.slice(3, 13)).toBe(code.slice(4));
      expect(reference.slice(13)).toBe('RM');
      expect(reference).toMatch(REMAINING_REFERENCE_PATTERN);
    }
  });

  it('carries no customer fact — every character comes from the code and the kind', () => {
    const reference = remainingTransferReference(EXAMPLE_ORDER_CODE);
    const allowed = new Set([...`ORD${HUMAN_CODE_ALPHABET}RM`]);
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
    expect(() => remainingTransferReference(code)).toThrow();
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
