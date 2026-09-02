import {
  formatPayableAmount,
  isPayableObligationAmount,
  isWholeDong,
  parsePayableAmount,
  payableTotalOf,
} from './payable-total';

/** The parse is the only entry point, so every case starts from a string. */
function amount(text: string) {
  const parsed = parsePayableAmount(text);
  if (parsed === undefined) {
    throw new Error(`fixture amount is unparseable: ${text}`);
  }
  return parsed;
}

describe('parsePayableAmount', () => {
  it.each([
    ['250000', '250000.00'],
    ['250000.00', '250000.00'],
    ['30000.5', '30000.50'],
    ['0', '0.00'],
  ])('reads %s as %s', (input, expected) => {
    expect(formatPayableAmount(amount(input))).toBe(expected);
  });

  it.each(['-1', '1e5', '1,000', '1.234', '', ' 100', '100 ', 'abc'])(
    'refuses %p rather than coercing it',
    (input) => {
      expect(parsePayableAmount(input)).toBeUndefined();
    },
  );

  it('refuses a negative fee by construction, not by a range check', () => {
    // `BR-027` fee >= 0. The pattern admits no sign at all, so there is no
    // ordering of checks in which a negative fee could reach the addition.
    expect(parsePayableAmount('-30000')).toBeUndefined();
  });

  it('keeps exactness at a magnitude a float would lose', () => {
    // 999999999999.99 is not representable as an IEEE-754 double without loss.
    expect(formatPayableAmount(amount('999999999999.99'))).toBe('999999999999.99');
  });
});

describe('payableTotalOf', () => {
  it('composes the §35 first-fee case exactly', () => {
    const total = payableTotalOf(amount('250000'), amount('30000'));
    expect(total).toBeDefined();
    expect(formatPayableAmount(total!)).toBe('280000.00');
  });

  it('composes the §35 correction case exactly', () => {
    const total = payableTotalOf(amount('250000'), amount('45000'));
    expect(formatPayableAmount(total!)).toBe('295000.00');
  });

  it('treats an explicit zero fee as free shipping, not as absence', () => {
    const total = payableTotalOf(amount('250000'), amount('0'));
    expect(formatPayableAmount(total!)).toBe('250000.00');
    // And the total is still payable — free shipping does not make the order free.
    expect(isPayableObligationAmount(total!)).toBe(true);
  });

  it('recomposes from the subtotal rather than compounding corrections', () => {
    // Two successive corrections against the same frozen subtotal must give the
    // second fee's total, never the first fee's total moved twice.
    const first = payableTotalOf(amount('250000'), amount('30000'))!;
    const second = payableTotalOf(amount('250000'), amount('45000'))!;
    expect(formatPayableAmount(first)).toBe('280000.00');
    expect(formatPayableAmount(second)).toBe('295000.00');
    expect(second - first).toBe(1_500_000n);
  });

  it('refuses a total that would overflow numeric(14,2)', () => {
    expect(payableTotalOf(amount('999999999999.99'), amount('0.01'))).toBeUndefined();
  });

  it('accepts a total that lands exactly on the column ceiling', () => {
    const total = payableTotalOf(amount('999999999999.98'), amount('0.01'));
    expect(formatPayableAmount(total!)).toBe('999999999999.99');
  });
});

describe('scale and positivity guards', () => {
  it('accepts a whole đồng and refuses a fractional one', () => {
    expect(isWholeDong(amount('280000'))).toBe(true);
    expect(isWholeDong(amount('280000.50'))).toBe(false);
  });

  it('refuses a zero obligation amount while allowing a zero fee', () => {
    // The asymmetry is the point: a fee of 0 is free shipping, a payable total
    // of 0 is nothing to pay and `ck_payment_obligations__amount_positive`
    // rejects it.
    expect(isPayableObligationAmount(amount('0'))).toBe(false);
    expect(isWholeDong(amount('0'))).toBe(true);
  });
});
