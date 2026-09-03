/**
 * @jest-environment node
 *
 * The eight-variant decision, asserted directly (`APP12-S03` §12, §13, §22,
 * §24, §29, §40).
 *
 * The variant is a pure function of the order projection plus two booleans, so
 * it is asserted here rather than only through a rendered screen: a rule that
 * decides whether a payment control exists deserves a test that cannot be
 * satisfied by the DOM happening to look right.
 */
import {
  ReadyMadeOrderAccessResponseStatus as OrderStatus,
  ReadyMadeOrderAccessResponseTerminationReason as TerminationReason,
} from '@embroidery/api-client';

import {
  attemptMatchesObligation,
  evidenceIntakeOpen,
  isPayable,
  orderVariantOf,
  readsFullPayment,
  showsPaymentBlock,
  variantToneOf,
} from '../../src/features/secure-ready-made-order/model/order-access-state';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../../src/features/secure-ready-made-order/model/transfer-evidence';
import {
  CORRECTED_FULL_AMOUNT,
  makeAttempt,
  makeAwaitingFee,
  makeCancelled,
  makeCorrectedFullPayment,
  makeExpired,
  makeFullPayment,
  makeFulfilment,
  makeOrder,
} from '../support/secure-ready-made-order-fixture';

const NO_SESSION = { attemptOpened: false, evidenceSubmitted: false } as const;

describe('orderVariantOf — the eight approved variants', () => {
  it('maps AWAITING_SHIPPING_FEE, where no total and no obligation exist', () => {
    expect(orderVariantOf(makeAwaitingFee(), NO_SESSION)).toBe('AWAITING_SHIPPING_FEE');
  });

  it('maps AWAITING_PAYMENT before this session has done anything', () => {
    expect(orderVariantOf(makeOrder(), NO_SESSION)).toBe('AWAITING_PAYMENT');
  });

  it.each([
    ['an attempt this session opened', { attemptOpened: true, evidenceSubmitted: false }],
    ['an image already submitted', { attemptOpened: false, evidenceSubmitted: true }],
    ['both', { attemptOpened: true, evidenceSubmitted: true }],
  ])('presents AWAITING_PAYMENT as PAYMENT_UNDER_REVIEW given %s', (_label, session) => {
    expect(orderVariantOf(makeOrder(), session)).toBe('PAYMENT_UNDER_REVIEW');
  });

  it.each([
    [OrderStatus.READY_FOR_DELIVERY, 'READY_FOR_DELIVERY'],
    [OrderStatus.DELIVERED, 'DELIVERED'],
    [OrderStatus.COMPLETED, 'COMPLETED'],
  ])('maps the fulfilment state %s', (status, expected) => {
    expect(orderVariantOf(makeFulfilment(status), NO_SESSION)).toBe(expected);
  });

  it('maps a cancellation with no recorded reason to CANCELLED, never EXPIRED', () => {
    const order = makeCancelled();
    // The key is absent, not null. That is the contract's own distinction.
    expect(Object.hasOwn(order, 'terminationReason')).toBe(false);
    expect(orderVariantOf(order, NO_SESSION)).toBe('CANCELLED');
  });

  it('maps a lapsed reservation to EXPIRED, from terminationReason alone', () => {
    const order = makeExpired();
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.terminationReason).toBe(TerminationReason.RESERVATION_EXPIRED);
    expect(orderVariantOf(order, NO_SESSION)).toBe('EXPIRED');
  });

  it('never lets a session fact rescue a terminal order onto a payment screen', () => {
    // §12/§13: the projection is the lifecycle authority. An attempt this
    // session happens to be holding may not keep a cancelled order payable.
    const busy = { attemptOpened: true, evidenceSubmitted: true } as const;
    expect(orderVariantOf(makeExpired(), busy)).toBe('EXPIRED');
    expect(orderVariantOf(makeCancelled(), busy)).toBe('CANCELLED');
    expect(orderVariantOf(makeFulfilment(OrderStatus.COMPLETED), busy)).toBe('COMPLETED');
  });

  it.each([OrderStatus.ON_HOLD, OrderStatus.CANCELLING])(
    'shows the undrawn stored state %s neutrally rather than guessing',
    (status) => {
      expect(orderVariantOf(makeOrder({ status }), NO_SESSION)).toBe('OTHER_STATE');
    },
  );
});

describe('showsPaymentBlock — §30 terminal shutdown', () => {
  it('is true for exactly the two payable presentations', () => {
    expect(showsPaymentBlock('AWAITING_PAYMENT')).toBe(true);
    // `911:328` keeps the instructions on screen while the workshop reconciles.
    expect(showsPaymentBlock('PAYMENT_UNDER_REVIEW')).toBe(true);
  });

  it.each([
    'AWAITING_SHIPPING_FEE',
    'READY_FOR_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'OTHER_STATE',
  ] as const)('is false for %s, so no payable control can be reached', (variant) => {
    expect(showsPaymentBlock(variant)).toBe(false);
  });
});

describe('readsFullPayment — §14 before-fee network discipline', () => {
  it('is true only while the order is AWAITING_PAYMENT', () => {
    expect(readsFullPayment(makeOrder())).toBe(true);
  });

  it.each([
    ['awaiting the fee', makeAwaitingFee()],
    ['cancelled', makeCancelled()],
    ['expired', makeExpired()],
    ['delivered', makeFulfilment(OrderStatus.DELIVERED)],
  ])('is false when %s, so no predictable 404 is spent', (_label, order) => {
    expect(readsFullPayment(order)).toBe(false);
  });
});

describe('isPayable — the server’s own answer, never re-derived', () => {
  it('is false with no obligation in hand at all', () => {
    expect(isPayable(undefined)).toBe(false);
  });

  it('reads the flag rather than the order status beside it', () => {
    // A response whose order status still says AWAITING_PAYMENT but whose
    // `payable` is false — which is what a settled obligation looks like for the
    // moment before the order moves. The flag wins.
    expect(isPayable(makeFullPayment({ payable: false }))).toBe(false);
    expect(isPayable(makeFullPayment())).toBe(true);
  });
});

describe('attemptMatchesObligation — §24 stale-attempt isolation', () => {
  it('accepts an attempt opened against the live obligation', () => {
    expect(attemptMatchesObligation(makeAttempt(), makeFullPayment())).toBe(true);
  });

  it('rejects an attempt whose obligation a fee correction superseded', () => {
    expect(attemptMatchesObligation(makeAttempt(), makeCorrectedFullPayment())).toBe(false);
  });

  it('does not treat the shared transfer reference as evidence of currency', () => {
    // The memo names the *order*, not the obligation, and is byte-identical
    // across a correction so a transfer sent before one still reconciles. A
    // comparison on it would call a stale attempt current.
    const attempt = makeAttempt();
    const successor = makeCorrectedFullPayment();
    expect(attempt.transferReference).toBe(successor.bankInstructions.transferReference);
    expect(attemptMatchesObligation(attempt, successor)).toBe(false);
  });

  it('compares exact decimal strings, never parsed numbers', () => {
    // `1310000.00` and `1310000.000` are the same number and different amounts.
    // The comparison must be the string one.
    const attempt = makeAttempt({ amount: `${CORRECTED_FULL_AMOUNT}0` });
    expect(attemptMatchesObligation(attempt, makeCorrectedFullPayment())).toBe(false);
  });
});

describe('evidenceIntakeOpen — §21, §23, §30', () => {
  it('is open on a payable order with a current attempt below quota', () => {
    expect(evidenceIntakeOpen('AWAITING_PAYMENT', 'a-1', 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(true);
    expect(evidenceIntakeOpen('PAYMENT_UNDER_REVIEW', 'a-1', 4, MAX_EVIDENCE_PER_ATTEMPT)).toBe(
      true,
    );
  });

  it('is closed with no attempt, so no id is ever invented to reach it', () => {
    expect(evidenceIntakeOpen('AWAITING_PAYMENT', undefined, 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(
      false,
    );
  });

  it('is closed at the server’s quota', () => {
    expect(
      evidenceIntakeOpen(
        'AWAITING_PAYMENT',
        'a-1',
        MAX_EVIDENCE_PER_ATTEMPT,
        MAX_EVIDENCE_PER_ATTEMPT,
      ),
    ).toBe(false);
  });

  it.each(['READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const)(
    'is closed on the terminal variant %s even with an attempt in hand',
    (variant) => {
      expect(evidenceIntakeOpen(variant, 'a-1', 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(false);
    },
  );
});

describe('variantToneOf — status is never colour alone', () => {
  it('gives every variant a tone, and the two terminal refusals share one', () => {
    expect(variantToneOf('CANCELLED')).toBe('DANGER');
    expect(variantToneOf('EXPIRED')).toBe('DANGER');
    expect(variantToneOf('PAYMENT_UNDER_REVIEW')).toBe('PROGRESS');
    expect(variantToneOf('AWAITING_SHIPPING_FEE')).toBe('WAITING');
    expect(variantToneOf('COMPLETED')).toBe('SUCCESS');
  });
});
