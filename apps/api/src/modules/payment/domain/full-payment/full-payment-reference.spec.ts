/**
 * The `FULL` transfer reference and the payability predicate (`APP12-B04` §14,
 * §16, §17).
 *
 * The deposit's own suite asserts that `depositTransferReference` has arity 1
 * and never produces another kind's code; the balance's asserts the same for
 * `RM`. This is the third instance: the same locked `APP7-G01` §4 format, the
 * kind code this checkpoint adds, and — the property that matters on a bank
 * statement — that all three differ for the same order code.
 *
 * Docker-free: no database, no container, no network.
 */
import { HUMAN_CODE_ALPHABET, generateHumanCode } from '@embroidery/domain-types';
import { randomBytes } from 'node:crypto';

import {
  DEPOSIT_REFERENCE_KIND_CODE,
  depositTransferReference,
} from '../deposit/deposit-reference';
import {
  REMAINING_REFERENCE_KIND_CODE,
  remainingTransferReference,
} from '../final-payment/final-payment-reference';
import {
  FULL_REFERENCE_KIND_CODE,
  FULL_REFERENCE_PATTERN,
  fullTransferReference,
} from './full-payment-reference';
import { isFullPaymentPayable } from './full-payment.policy';
import {
  isVerifiableObligationKind,
  VERIFIABLE_OBLIGATION_KINDS,
  verifiedPaymentTransitionFor,
} from '../verification/verified-payment-transition';

/** The exact example `APP7-G01` §4 spells out, with this checkpoint's code. */
const EXAMPLE_ORDER_CODE = 'ORD-7K3MPQ2XVD';
const EXAMPLE_REFERENCE = 'ORD7K3MPQ2XVDFL';

describe('APP12-B04 — the full-payment transfer reference', () => {
  it('is the G01 format with the FL kind code', () => {
    expect(fullTransferReference(EXAMPLE_ORDER_CODE)).toBe(EXAMPLE_REFERENCE);
    expect(FULL_REFERENCE_KIND_CODE).toBe('FL');
  });

  it('is 15 uppercase alphanumeric characters and matches the locked pattern', () => {
    const reference = fullTransferReference(EXAMPLE_ORDER_CODE);
    expect(reference).toHaveLength(15);
    // The EMVCo-safe character rule the QR payload depends on.
    expect(reference).toMatch(/^[A-Z0-9]{15}$/);
    expect(reference).toMatch(FULL_REFERENCE_PATTERN);
  });

  it('differs from both custom memos for the same order code', () => {
    // A Ready-Made order can never carry a DEPOSIT or a REMAINING
    // (`ck_payment_obligations__kind_by_origin`), so these three never appear on
    // one order. They still have to differ: an operator reconciling a statement
    // across the whole shop reads the memo before they read the order.
    const full = fullTransferReference(EXAMPLE_ORDER_CODE);
    const deposit = depositTransferReference(EXAMPLE_ORDER_CODE);
    const remaining = remainingTransferReference(EXAMPLE_ORDER_CODE);

    expect(new Set([full, deposit, remaining]).size).toBe(3);
    // Only the last two characters differ — the format is parsed by position.
    expect(full.slice(0, 13)).toBe(deposit.slice(0, 13));
    expect(full.slice(13)).toBe(FULL_REFERENCE_KIND_CODE);
    expect(deposit.slice(13)).toBe(DEPOSIT_REFERENCE_KIND_CODE);
    expect(remaining.slice(13)).toBe(REMAINING_REFERENCE_KIND_CODE);
  });

  it('takes an order code and nothing else, so it cannot mint another kind', () => {
    // `APP7-G01` §4 forbids a kind parameter: a builder that can derive another
    // obligation's memo lets one surface address an obligation it does not make
    // payable. The arity is the enforcement.
    expect(fullTransferReference).toHaveLength(1);
  });

  it('derives the same memo for every real order code the generator draws', () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateHumanCode('ORD-', randomBytes);
      const reference = fullTransferReference(code);
      expect(reference).toMatch(FULL_REFERENCE_PATTERN);
      // Stable: the same code always yields the same memo, which is what lets a
      // retry, a new attempt and a fee correction all reconcile to one transfer.
      expect(fullTransferReference(code)).toBe(reference);
      for (const character of reference.slice(3, 13)) {
        expect(HUMAN_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it.each([
    ['an unprefixed code', '7K3MPQ2XVD'],
    ['a code with the wrong prefix', 'REQ-7K3MPQ2XVD'],
    ['a code that is too short', 'ORD-7K3MPQ2X'],
    ['a code using an excluded character', 'ORD-7K3MPQ2XVI'],
  ])('refuses %s rather than coercing it into an unreconcilable memo', (_label, code) => {
    expect(() => fullTransferReference(code)).toThrow();
  });
});

describe('APP12-B04 — when a FULL obligation is payable', () => {
  it('is payable only while the order awaits payment and the obligation is pending', () => {
    expect(
      isFullPaymentPayable({ orderStatus: 'AWAITING_PAYMENT', obligationStatus: 'PENDING' }),
    ).toBe(true);
  });

  it.each([
    // The obligation does not exist yet at this state, so this pair is
    // unreachable in practice — stated so a future edit cannot make it payable.
    ['AWAITING_SHIPPING_FEE', 'PENDING'],
    // A lapsed reservation cancels both. Paying now would be money to refund.
    ['CANCELLED', 'PENDING'],
    ['CANCELLED', 'CANCELLED'],
    // After APP12-B05 verifies, payment is already collected.
    ['READY_FOR_DELIVERY', 'SATISFIED'],
    ['DELIVERED', 'SATISFIED'],
    ['COMPLETED', 'SATISFIED'],
    // The window between an Admin verifying and the order moving.
    ['AWAITING_PAYMENT', 'SATISFIED'],
    // A shipping-fee correction: the predecessor is payable at no price.
    ['AWAITING_PAYMENT', 'SUPERSEDED'],
    ['AWAITING_PAYMENT', 'CANCELLED'],
  ] as const)('is not payable at %s / %s', (orderStatus, obligationStatus) => {
    expect(isFullPaymentPayable({ orderStatus, obligationStatus })).toBe(false);
  });
});

/**
 * `APP12-B05` §7 — the boundary `APP12-B04` deliberately stopped at, now
 * crossed.
 *
 * B04 made the Ready-Made payment *collectable* and left `FULL` unverifiable,
 * so no Admin could settle it before the inventory half of that settlement
 * existed. B05 delivered that half, and the crossing is what this asserts:
 * `AWAITING_PAYMENT -> READY_FOR_DELIVERY` on a verified `FULL`.
 *
 * Asserted against the delivered transition table rather than through an HTTP
 * call, because the table is where the boundary actually lives. `APP12-B05`
 * moved it: `FULL` is now a row, added the way this file predicted it would
 * have to be — one entry plus the tests that justify it, never an `if` in a
 * use case — so the assertion below is the same assertion inverted, and a
 * regression that dropped the row would fail it just as loudly.
 */
describe('APP12-B05 — FULL is verifiable through the one canonical table', () => {
  it('admits FULL alongside the two custom kinds', () => {
    expect([...VERIFIABLE_OBLIGATION_KINDS].sort()).toEqual(['DEPOSIT', 'FULL', 'REMAINING']);
    expect(isVerifiableObligationKind('FULL')).toBe(true);
  });

  it('publishes the Ready-Made LC-14 pair and leaves the custom ones untouched', () => {
    // The whole of B05’s contribution to this file: one row. A `FULL`
    // verification moves the order off the one state only a Ready-Made order
    // reaches, so it can never be applied to a custom one.
    expect(verifiedPaymentTransitionFor('FULL')).toEqual({
      source: 'AWAITING_PAYMENT',
      target: 'READY_FOR_DELIVERY',
    });
    expect(verifiedPaymentTransitionFor('DEPOSIT')).toEqual({
      source: 'AWAITING_DEPOSIT',
      target: 'DEPOSIT_PAID',
    });
    expect(verifiedPaymentTransitionFor('REMAINING')).toEqual({
      source: 'AWAITING_FINAL_PAYMENT',
      target: 'READY_FOR_DELIVERY',
    });
  });
});
