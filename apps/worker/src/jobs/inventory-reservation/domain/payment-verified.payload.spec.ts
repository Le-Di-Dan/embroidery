/**
 * The `payment.verified` contract as consumed (`APP8-W01` §3, §13).
 *
 * The producer's own shape is the fixture here on purpose: if
 * `payment-decision.recorder.ts` ever stopped writing one of these keys, this
 * suite is where a consumer that silently accepted the shortfall would be caught.
 */
import {
  deriveReservationEffectKey,
  parsePaymentVerifiedPayload,
  VERIFIED_OBLIGATION_KINDS,
  PAYMENT_ATTEMPT_AGGREGATE_KIND,
  PAYMENT_VERIFIED_EVENT_TYPE,
  PAYMENT_VERIFIED_PAYLOAD_VERSION,
} from './payment-verified.payload';

/** Byte-for-byte the object `PaymentDecisionRecorder.recordVerified` appends. */
const PRODUCER_PAYLOAD = {
  paymentAttemptId: 'attempt-1',
  paymentObligationId: 'obligation-1',
  obligationKind: 'DEPOSIT',
  orderId: 'order-1',
};

describe('the accepted SE-007 contract', () => {
  it('names the delivered event type, version and aggregate', () => {
    expect(PAYMENT_VERIFIED_EVENT_TYPE).toBe('payment.verified');
    expect(PAYMENT_VERIFIED_PAYLOAD_VERSION).toBe(1);
    expect(PAYMENT_ATTEMPT_AGGREGATE_KIND).toBe('PAYMENT_ATTEMPT');
  });

  it('accepts a DEPOSIT payload and keeps the lookup keys and the kind', () => {
    const result = parsePaymentVerifiedPayload(PRODUCER_PAYLOAD);

    expect(result).toEqual({
      valid: true,
      payload: {
        orderId: 'order-1',
        paymentAttemptId: 'attempt-1',
        paymentObligationId: 'obligation-1',
        obligationKind: 'DEPOSIT',
      },
    });
  });

  it('accepts the same shape carrying REMAINING (APP9-B03, FU-APP8-W01-01)', () => {
    // The event that used to dead-letter. Same four keys, same version, same
    // aggregate linkage — only the kind differs, and it is now a variable.
    const result = parsePaymentVerifiedPayload({
      ...PRODUCER_PAYLOAD,
      obligationKind: 'REMAINING',
    });

    expect(result).toEqual({
      valid: true,
      payload: {
        orderId: 'order-1',
        paymentAttemptId: 'attempt-1',
        paymentObligationId: 'obligation-1',
        obligationKind: 'REMAINING',
      },
    });
  });

  it('accepts exactly two kinds and no others', () => {
    expect(VERIFIED_OBLIGATION_KINDS).toEqual(['DEPOSIT', 'REMAINING']);
  });

  it.each([
    ['not an object', 'payment.verified'],
    ['null', null],
    ['a missing order id', { ...PRODUCER_PAYLOAD, orderId: undefined }],
    ['a blank order id', { ...PRODUCER_PAYLOAD, orderId: '' }],
    ['a missing attempt id', { ...PRODUCER_PAYLOAD, paymentAttemptId: undefined }],
    ['a missing obligation id', { ...PRODUCER_PAYLOAD, paymentObligationId: undefined }],
  ])('refuses %s as an invalid payload', (_label, payload) => {
    expect(parsePaymentVerifiedPayload(payload)).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });

  it.each([
    ['an unknown future kind', 'FINAL_SETTLEMENT'],
    ['a lowercased known kind', 'remaining'],
    ['a kind that merely starts with a known one', 'DEPOSIT_TOPUP'],
    ['a missing kind', undefined],
    ['a non-string kind', 1],
  ])('refuses %s — no coercion onto either branch', (_label, obligationKind) => {
    // The set is closed. A producer ahead of this build must reach an operator
    // as a terminal malformed payload, never be guessed onto DEPOSIT (a second
    // reservation) or onto REMAINING (a silent no-op).
    expect(parsePaymentVerifiedPayload({ ...PRODUCER_PAYLOAD, obligationKind })).toEqual({
      valid: false,
      errorClass: 'JOB_PAYLOAD_INVALID',
    });
  });

  it.each(VERIFIED_OBLIGATION_KINDS)('still validates the ids for a %s payload', (kind) => {
    // The kind widening must not weaken anything else the parser refuses.
    expect(
      parsePaymentVerifiedPayload({ ...PRODUCER_PAYLOAD, obligationKind: kind, orderId: '' }),
    ).toEqual({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' });
  });
});

describe('the effect key', () => {
  it('is the order, so two deliveries of one verification are one effect', () => {
    const first = deriveReservationEffectKey({ orderId: 'order-1' });
    const second = deriveReservationEffectKey({ orderId: 'order-1' });

    expect(first).toBe(second);
    expect(first).toContain('order-1');
  });

  it('separates two orders', () => {
    expect(deriveReservationEffectKey({ orderId: 'order-1' })).not.toBe(
      deriveReservationEffectKey({ orderId: 'order-2' }),
    );
  });
});
