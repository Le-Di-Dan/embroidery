/**
 * The settlement-effect table (`APP12-B05` §5, §30).
 *
 * The point of the table is that the two custom kinds reach **nothing**. A
 * `DEPOSIT` verification that grew a stock commitment would decrement on-hand
 * for units APP8 has not reserved yet; a `REMAINING` one would decrement a
 * second time for units production start already consumed. Both are silent
 * money defects, and neither would be caught by a test that only checked the
 * Ready-Made path works.
 *
 * Docker-free: no database, no container, no network.
 */
import {
  verifiedPaymentSettlementFor,
  type VerifiedPaymentSettlementEffect,
} from './verified-payment-settlement';
import { VERIFIABLE_OBLIGATION_KINDS } from './verified-payment-transition';

describe('APP12-B05 — what a verified payment settles beyond the money', () => {
  it('commits reserved stock for FULL, and only for FULL', () => {
    expect(verifiedPaymentSettlementFor('FULL')).toBe('COMMIT_RESERVED_STOCK');
  });

  it.each(['DEPOSIT', 'REMAINING'] as const)('leaves %s with no inventory effect', (kind) => {
    expect(verifiedPaymentSettlementFor(kind)).toBe('NONE');
  });

  it('answers for every verifiable kind', () => {
    // The table is a total `Record`, so a kind added to `CST-039` without a
    // decision about its inventory effect stops compiling. This is the runtime
    // half of that: nothing resolves to `undefined` and silently means "none".
    const effects = VERIFIABLE_OBLIGATION_KINDS.map((kind) => verifiedPaymentSettlementFor(kind));
    const allowed: readonly VerifiedPaymentSettlementEffect[] = ['NONE', 'COMMIT_RESERVED_STOCK'];
    expect(effects).toHaveLength(VERIFIABLE_OBLIGATION_KINDS.length);
    for (const effect of effects) {
      expect(allowed).toContain(effect);
    }
  });

  it('commits stock for exactly one kind', () => {
    const committing = VERIFIABLE_OBLIGATION_KINDS.filter(
      (kind) => verifiedPaymentSettlementFor(kind) === 'COMMIT_RESERVED_STOCK',
    );
    expect(committing).toEqual(['FULL']);
  });
});
