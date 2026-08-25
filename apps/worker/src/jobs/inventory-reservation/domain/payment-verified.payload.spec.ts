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

  it('accepts the producer payload and keeps only the lookup keys', () => {
    const result = parsePaymentVerifiedPayload(PRODUCER_PAYLOAD);

    expect(result).toEqual({
      valid: true,
      payload: {
        orderId: 'order-1',
        paymentAttemptId: 'attempt-1',
        paymentObligationId: 'obligation-1',
      },
    });
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

  it('refuses an obligation kind other than DEPOSIT', () => {
    // `TR-LC17-04` is gated on the deposit verified event, and the producer
    // writes `DEPOSIT` as a literal. A remaining-payment verification must reach
    // an operator rather than reserve stock a second time — extending this
    // consumer is APP9's deliberate work, not this handler's guess.
    expect(
      parsePaymentVerifiedPayload({ ...PRODUCER_PAYLOAD, obligationKind: 'REMAINING' }),
    ).toEqual({ valid: false, errorClass: 'JOB_PAYLOAD_INVALID' });
  });
});

describe('the effect key', () => {
  it('is the order, so two deliveries of one verification are one effect', () => {
    const first = deriveReservationEffectKey({
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      paymentObligationId: 'obligation-1',
    });
    const second = deriveReservationEffectKey({
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      paymentObligationId: 'obligation-1',
    });

    expect(first).toBe(second);
    expect(first).toContain('order-1');
  });

  it('separates two orders', () => {
    expect(
      deriveReservationEffectKey({
        orderId: 'order-1',
        paymentAttemptId: 'a',
        paymentObligationId: 'o',
      }),
    ).not.toBe(
      deriveReservationEffectKey({
        orderId: 'order-2',
        paymentAttemptId: 'a',
        paymentObligationId: 'o',
      }),
    );
  });
});
