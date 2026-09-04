/**
 * Which verified obligation kind reserves inventory (`APP12-H03-C1` §8).
 *
 * The decision is one boolean per kind, and getting it wrong in either
 * direction is a stock defect rather than a routing one: a false `true` commits
 * a second set of units against goods that are already sold, and a false
 * `false` leaves a paid custom order with no reservation at all. So each kind is
 * asserted by name, and the closed set is asserted as covered — a fourth kind
 * added to `VERIFIED_OBLIGATION_KINDS` fails the last case here as well as the
 * compiler's exhaustiveness check.
 */
import { VERIFIED_OBLIGATION_KINDS } from './payment-verified.payload';
import { requiresInventoryReservation } from './reservation-trigger.policy';

describe('requiresInventoryReservation', () => {
  it('reserves for a verified DEPOSIT (TR-LC17-04)', () => {
    expect(requiresInventoryReservation('DEPOSIT')).toBe(true);
  });

  it('reserves nothing for a verified REMAINING — the stock was committed at production start', () => {
    expect(requiresInventoryReservation('REMAINING')).toBe(false);
  });

  it('reserves nothing for a verified FULL — APP12-B05 already consumed the hold', () => {
    // Not "nothing to do yet" but "nothing left to do": the Ready-Made
    // reservation moved to CONSUMED and on-hand was decremented inside the
    // transaction that appended this very event. Reserving here would hold
    // units that are sold; consuming here would decrement twice.
    expect(requiresInventoryReservation('FULL')).toBe(false);
  });

  it('answers exactly one kind with true', () => {
    const reserving = VERIFIED_OBLIGATION_KINDS.filter((kind) =>
      requiresInventoryReservation(kind),
    );

    expect(reserving).toEqual(['DEPOSIT']);
  });
});
