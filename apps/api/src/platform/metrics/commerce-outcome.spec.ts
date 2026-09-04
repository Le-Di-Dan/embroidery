/**
 * Refusal versus system failure (`APP12-H03` §7, §22, §26.26).
 *
 * The single classification every alert rule in §15 depends on. The asymmetry
 * is the property under test: a recognised refusal is `refused`, and *anything*
 * else is `system_error` — including an error that simply has no classifier
 * yet, because the alternative is a new failure mode that silently joins the
 * "customer asked for too many units" series and never wakes anyone.
 */
import { classifyOutcome, SUCCEEDED, startMetricTimer } from './commerce-outcome';

class DomainRefusal extends Error {
  constructor(readonly failure: string) {
    super(failure);
  }
}

const recognize = (error: unknown): string | undefined =>
  error instanceof DomainRefusal ? error.failure : undefined;

describe('classifyOutcome', () => {
  it('names a recognised refusal', () => {
    expect(classifyOutcome(new DomainRefusal('SKU_NOT_AVAILABLE'), recognize)).toEqual({
      outcome: 'refused',
      reasonClass: 'SKU_NOT_AVAILABLE',
    });
  });

  it.each([
    ['a plain Error', new Error('connection terminated unexpectedly')],
    ['a thrown string', 'boom'],
    ['undefined', undefined],
    ['a database error object', { code: '40P01', message: 'deadlock detected' }],
  ])('classifies %s as a system error', (_label, error) => {
    expect(classifyOutcome(error, recognize)).toEqual({
      outcome: 'system_error',
      reasonClass: 'other',
    });
  });

  it('never carries a message into the reason class', () => {
    const classified = classifyOutcome(
      new DomainRefusal('Order 6f1c9a3e is not payable by +84901234567'),
      recognize,
    );
    // The code does not match the deliberate-constant shape, so it folds.
    expect(classified.reasonClass).toBe('other');
  });

  it('reports a success with no reason', () => {
    expect(SUCCEEDED).toEqual({ outcome: 'success', reasonClass: 'other' });
  });
});

describe('startMetricTimer', () => {
  it('returns a non-negative duration in seconds', () => {
    const elapsed = startMetricTimer();
    const seconds = elapsed();
    expect(seconds).toBeGreaterThanOrEqual(0);
    // Nothing in this test takes a second; a value in milliseconds rather than
    // seconds would fail here, which is the unit mistake worth catching.
    expect(seconds).toBeLessThan(1);
  });
});
