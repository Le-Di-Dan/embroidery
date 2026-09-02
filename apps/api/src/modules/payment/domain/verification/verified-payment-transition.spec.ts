/**
 * The kind → LC-14 transition table (`APP9-B03` §7).
 *
 * The integration suite proves both rows behaviourally, so this suite exists for
 * the one property HTTP cannot reach: `CST-039` has exactly two kinds today, so
 * there is no way to send a third through the endpoint and observe that it is
 * refused rather than silently given the deposit's transition. That is asserted
 * here, directly.
 *
 * Docker-free: no database, no container, no network.
 */
import {
  VERIFIABLE_OBLIGATION_KINDS,
  isVerifiableObligationKind,
  verifiedPaymentTransitionFor,
} from './verified-payment-transition';

describe('APP9-B03 — the verified-payment transition table', () => {
  it('maps DEPOSIT to TR-LC14-02', () => {
    expect(verifiedPaymentTransitionFor('DEPOSIT')).toEqual({
      source: 'AWAITING_DEPOSIT',
      target: 'DEPOSIT_PAID',
    });
  });

  it('maps REMAINING to TR-LC14-06', () => {
    expect(verifiedPaymentTransitionFor('REMAINING')).toEqual({
      source: 'AWAITING_FINAL_PAYMENT',
      target: 'READY_FOR_DELIVERY',
    });
  });

  it('maps FULL to the Ready-Made payment move (APP12-B05)', () => {
    expect(verifiedPaymentTransitionFor('FULL')).toEqual({
      source: 'AWAITING_PAYMENT',
      target: 'READY_FOR_DELIVERY',
    });
  });

  it('never lets one kind inherit another’s move', () => {
    const deposit = verifiedPaymentTransitionFor('DEPOSIT');
    const remaining = verifiedPaymentTransitionFor('REMAINING');
    const full = verifiedPaymentTransitionFor('FULL');
    expect(deposit?.source).not.toBe(remaining?.source);
    expect(deposit?.target).not.toBe(remaining?.target);
    // FULL and REMAINING deliberately share a *target*: both commerce shapes
    // converge on one fulfilment lifecycle. What keeps them from being applied
    // to each other’s orders is the source, which is disjoint.
    expect(full?.source).not.toBe(remaining?.source);
    expect(full?.source).not.toBe(deposit?.source);
    expect(full?.target).toBe('READY_FOR_DELIVERY');
  });

  it('carries exactly the three CST-039 kinds', () => {
    expect([...VERIFIABLE_OBLIGATION_KINDS].sort()).toEqual(['DEPOSIT', 'FULL', 'REMAINING']);
  });

  it.each([
    ['a fourth kind the database might grow later', 'INSTALMENT'],
    ['a lowercase spelling', 'deposit'],
    ['an order state mistaken for a kind', 'DEPOSIT_PAID'],
    ['an empty string', ''],
  ])('refuses %s rather than defaulting to the deposit', (_case, kind) => {
    // The whole reason this is a lookup and not a widened `!==` comparison. A
    // kind with no row here resolves to `undefined`, and the chain resolver
    // turns that into PAYMENT_ATTEMPT_NOT_VERIFIABLE.
    expect(isVerifiableObligationKind(kind)).toBe(false);
    expect(verifiedPaymentTransitionFor(kind)).toBeUndefined();
  });

  it('narrows the kind for a caller that asks first', () => {
    const kind: string = 'REMAINING';
    expect(isVerifiableObligationKind(kind)).toBe(true);
    if (isVerifiableObligationKind(kind)) {
      // The predicate is what lets the resolver hand a plain database string to
      // the typed table without an assertion.
      expect(verifiedPaymentTransitionFor(kind)).toBeDefined();
    }
  });
});
