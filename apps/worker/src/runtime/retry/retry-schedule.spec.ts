import { retryDelayMs } from './retry-schedule';

describe('retry schedule', () => {
  it('doubles from the base, starting at attempt 1', () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) => retryDelayMs(attempt, 1_000, 1_000_000));

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });

  it('caps at backoffMaxMs', () => {
    expect(retryDelayMs(20, 1_000, 60_000)).toBe(60_000);
  });

  it('never exceeds the cap for any attempt in a plausible range', () => {
    for (let attempt = 1; attempt <= 64; attempt += 1) {
      expect(retryDelayMs(attempt, 1_000, 60_000)).toBeLessThanOrEqual(60_000);
    }
  });

  it('stays a finite safe integer at an absurd attempt number', () => {
    // The doubling cap keeps the multiplication exact, so the `Math.min` cap
    // applies to a real number rather than to Infinity.
    const delay = retryDelayMs(5_000, 1_000, 60_000);

    expect(Number.isSafeInteger(delay)).toBe(true);
    expect(delay).toBe(60_000);
  });

  it('honours a base already above the cap by returning the cap', () => {
    expect(retryDelayMs(1, 90_000, 60_000)).toBe(60_000);
  });

  it.each([0, -1, 1.5])('rejects attempt number %p', (attempt) => {
    expect(() => retryDelayMs(attempt, 1_000, 60_000)).toThrow(RangeError);
  });
});
