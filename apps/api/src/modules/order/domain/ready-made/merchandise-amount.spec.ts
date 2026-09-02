/**
 * `merchandise-amount.ts` — the exactness claims, proved without a database.
 *
 * The load-bearing case is the last one: a value that a `parseFloat`
 * implementation would get wrong. Everything else here is the boundary of
 * `numeric(14,2)` and the VND scale rule, which is what decides whether a SKU
 * is priceable at all.
 */
import {
  fitsMerchandiseColumn,
  formatMerchandiseAmount,
  isWholeDong,
  multiplyMerchandiseAmount,
  parseMerchandiseAmount,
  type MerchandiseAmount,
} from './merchandise-amount';

/** Parses or fails the test — the arithmetic cases are not about parsing. */
function amount(text: string): MerchandiseAmount {
  const parsed = parseMerchandiseAmount(text);
  if (parsed === undefined) {
    throw new Error(`fixture amount is not parseable: ${text}`);
  }
  return parsed;
}

describe('APP12-B02 merchandise amount', () => {
  describe('parsing', () => {
    it.each([
      ['150000', '150000.00'],
      ['150000.0', '150000.00'],
      ['150000.00', '150000.00'],
      ['0', '0.00'],
      ['999999999999.99', '999999999999.99'],
    ])('round-trips %s as the column stores it', (input, stored) => {
      expect(formatMerchandiseAmount(amount(input))).toBe(stored);
    });

    it.each([
      ['an exponent', '1e6'],
      ['a sign', '-1000'],
      ['a thousands separator', '1,000'],
      ['a third decimal', '1000.001'],
      ['thirteen integer digits', '1000000000000'],
      ['whitespace', ' 1000 '],
      ['nothing', ''],
      ['words', 'free'],
    ])('refuses %s', (_label, input) => {
      expect(parseMerchandiseAmount(input)).toBeUndefined();
    });
  });

  describe('the VND scale rule', () => {
    it('accepts a whole đồng', () => {
      expect(isWholeDong(amount('150000.00'))).toBe(true);
      expect(isWholeDong(amount('0'))).toBe(true);
    });

    it('rejects a fractional đồng, mirroring the database CHECK', () => {
      expect(isWholeDong(amount('150000.50'))).toBe(false);
      expect(isWholeDong(amount('0.01'))).toBe(false);
    });
  });

  describe('multiplication', () => {
    it('computes a line total exactly', () => {
      expect(formatMerchandiseAmount(multiplyMerchandiseAmount(amount('150000'), 3))).toBe(
        '450000.00',
      );
    });

    it('is exact where IEEE-754 is not', () => {
      // `0.1 * 3` is `0.30000000000000004` as a double. In hundredths it is 30.
      expect(formatMerchandiseAmount(multiplyMerchandiseAmount(amount('0.10'), 3))).toBe('0.30');
      // A realistic VND magnitude a float would round: 8 999 999 x 7.
      expect(formatMerchandiseAmount(multiplyMerchandiseAmount(amount('8999999'), 7))).toBe(
        '62999993.00',
      );
    });

    it('keeps a quantity of one unchanged', () => {
      expect(formatMerchandiseAmount(multiplyMerchandiseAmount(amount('150000'), 1))).toBe(
        '150000.00',
      );
    });
  });

  describe('the column bound', () => {
    it('accepts a result that still fits numeric(14,2)', () => {
      expect(fitsMerchandiseColumn(multiplyMerchandiseAmount(amount('999999999999'), 1))).toBe(
        true,
      );
    });

    it('rejects a result that has overflowed it', () => {
      // A legitimate price and a legitimate quantity can still exceed twelve
      // integer digits. Refusing here is what stops the driver reporting it.
      expect(fitsMerchandiseColumn(multiplyMerchandiseAmount(amount('999999999999'), 2))).toBe(
        false,
      );
    });
  });

  describe('what the module cannot do', () => {
    it('exposes no addition, subtraction, percentage or rounding', () => {
      // `BR-027` — a module with no addition cannot be edited into folding a
      // shipping fee into a merchandise subtotal.
      const api = Object.keys(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./merchandise-amount') as Record<string, unknown>,
      ).sort();
      expect(api).toEqual([
        'fitsMerchandiseColumn',
        'formatMerchandiseAmount',
        'isWholeDong',
        'multiplyMerchandiseAmount',
        'parseMerchandiseAmount',
      ]);
    });
  });
});
