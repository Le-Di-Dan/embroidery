/**
 * The verification predicate, proved without a database (`APP7-B04` §12, §21,
 * §22).
 *
 * These are the decisions that must never be wrong, and they are pure functions
 * precisely so they can be exercised at every boundary a real transaction would
 * only ever reach one of at a time.
 */
import {
  classifyAttemptForVerification,
  isSameVerificationApplication,
  judgeObservedTransfer,
  type ExpectedTransferFacts,
} from './payment-verification.policy';
import { observedAmountMatches } from './observed-amount';
import { reconciliationActionFor } from './reconciliation-evidence';

const EXPECTED: ExpectedTransferFacts = {
  amount: '765000.00',
  currencyCode: 'VND',
  transferReference: 'ORD7K3MPQ2XVDDC',
};

describe('observedAmountMatches — exact money equality', () => {
  it('treats the whole-đồng and two-decimal spellings as one amount', () => {
    // The column stores `765000.00`; an operator reading a bank statement types
    // `765000`. Both are the same money and neither may be refused.
    expect(observedAmountMatches('765000', '765000.00')).toBe(true);
    expect(observedAmountMatches('765000.0', '765000.00')).toBe(true);
    expect(observedAmountMatches('765000.00', '765000.00')).toBe(true);
  });

  it('refuses an under-payment and an over-payment by a single đồng', () => {
    expect(observedAmountMatches('764999.00', '765000.00')).toBe(false);
    expect(observedAmountMatches('765001.00', '765000.00')).toBe(false);
  });

  it('stays exact where a float comparison would not', () => {
    // `0.1 + 0.2 !== 0.3` is the whole argument for the bigint scan. These two
    // are a cent apart and must never compare equal.
    expect(observedAmountMatches('0.10', '0.30')).toBe(false);
    expect(observedAmountMatches('99999999999.99', '99999999999.99')).toBe(true);
    expect(observedAmountMatches('99999999999.99', '99999999999.98')).toBe(false);
  });

  it('refuses anything that is not a plain decimal', () => {
    for (const text of ['1e6', '+765000', '-765000', ' 765000', '765,000', '765000.000', '']) {
      expect(observedAmountMatches(text, '765000.00')).toBe(false);
    }
  });
});

describe('judgeObservedTransfer — the exact-match predicate', () => {
  it('matches only when both observed facts are exact', () => {
    expect(
      judgeObservedTransfer({ amount: '765000', transferReference: 'ORD7K3MPQ2XVDDC' }, EXPECTED),
    ).toEqual({ matched: true });
  });

  it('reports a wrong amount as a mismatch, never as a match', () => {
    expect(
      judgeObservedTransfer({ amount: '700000', transferReference: 'ORD7K3MPQ2XVDDC' }, EXPECTED),
    ).toEqual({ matched: false, mismatch: 'AMOUNT_MISMATCH' });
  });

  it('reports a wrong reference as a mismatch, and does not normalise it', () => {
    for (const reference of [
      'ORD7K3MPQ2XVDRM',
      'ord7k3mpq2xvddc',
      'ORD-7K3MPQ2XVD-DC',
      'ORD7K3MPQ2XVDD',
    ]) {
      expect(
        judgeObservedTransfer({ amount: '765000', transferReference: reference }, EXPECTED),
      ).toEqual({ matched: false, mismatch: 'REFERENCE_MISMATCH' });
    }
  });

  it('refuses an obligation whose currency is not VND, without looking at the amount', () => {
    expect(
      judgeObservedTransfer(
        { amount: '765000', transferReference: 'ORD7K3MPQ2XVDDC' },
        { ...EXPECTED, currencyCode: 'USD' },
      ),
    ).toEqual({ matched: false, mismatch: 'CURRENCY_MISMATCH' });
  });
});

describe('classifyAttemptForVerification — terminal states never regress', () => {
  it('admits the three LC-16 statuses a manual decision may settle from', () => {
    for (const status of ['PENDING', 'PROCESSING', 'REQUIRES_REVIEW'] as const) {
      expect(classifyAttemptForVerification(status)).toBe('open');
    }
  });

  it('separates SUCCEEDED, which only an exact replay may read', () => {
    expect(classifyAttemptForVerification('SUCCEEDED')).toBe('succeeded');
  });

  it('closes every other terminal state to any decision', () => {
    for (const status of ['FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const) {
      expect(classifyAttemptForVerification(status)).toBe('settled');
    }
  });
});

describe('isSameVerificationApplication — the network-timeout retry', () => {
  const attemptId = 'attempt-1';
  const committed = {
    attemptStatus: 'SUCCEEDED',
    obligationStatus: 'SATISFIED',
    satisfiedByAttemptId: attemptId,
    attemptId,
    observed: { amount: '765000', transferReference: 'ORD7K3MPQ2XVDDC' },
    expected: EXPECTED,
  } as const;

  it('recognises the identical retry of a verification that already committed', () => {
    expect(isSameVerificationApplication(committed)).toBe(true);
  });

  it('refuses when the deposit was satisfied by a different attempt (CC-10’s loser)', () => {
    expect(isSameVerificationApplication({ ...committed, satisfiedByAttemptId: 'attempt-2' })).toBe(
      false,
    );
  });

  it('refuses a SUCCEEDED attempt whose obligation is still PENDING', () => {
    // A state no committed verification can produce. Treating it as a replay
    // would report success for a deposit nobody satisfied.
    expect(isSameVerificationApplication({ ...committed, obligationStatus: 'PENDING' })).toBe(
      false,
    );
  });

  it('refuses a retry carrying different observed facts', () => {
    expect(
      isSameVerificationApplication({
        ...committed,
        observed: { amount: '700000', transferReference: 'ORD7K3MPQ2XVDDC' },
      }),
    ).toBe(false);
  });
});

describe('reconciliationActionFor — the closed DB4 vocabulary', () => {
  it('records resolving an open review as RESOLVE_REVIEW', () => {
    expect(reconciliationActionFor('REQUIRES_REVIEW')).toBe('RESOLVE_REVIEW');
  });

  it('records every other manual decision as MANUAL_MATCH', () => {
    for (const status of ['PENDING', 'PROCESSING'] as const) {
      expect(reconciliationActionFor(status)).toBe('MANUAL_MATCH');
    }
  });
});
