/**
 * @jest-environment node
 *
 * The guard that moved with the code (`APP12-H01`, FU-APP12-S01-02 /
 * FU-APP12-S03-05).
 *
 * Five features each held their own copy of the exact-money formatter, and each
 * deferred promoting it for one honest reason: every feature's boundary suite
 * proves *its own directory* contains no numeric coercion by scanning it, so a
 * file that left the directory would leave its guard. This file is that guard,
 * relocated — the shared module is scanned by the same rule the five directories
 * applied, so consolidation removed the duplication without removing the
 * protection.
 *
 * The rule it enforces is `APP7-G01`'s: a VND amount is a decimal **string**,
 * and the moment it passes through an IEEE-754 double the precision is gone in a
 * way no later formatting can restore. The formatter may therefore do string
 * work and nothing else.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  formatExactAmount,
  formatExactMoney,
  formatExactPercent,
  isZeroAmount,
} from '../../src/shared/money/exact-money';

const MODULE_PATH = join(__dirname, '..', '..', 'src', 'shared', 'money', 'exact-money.ts');

/**
 * Comments explain the rule and therefore name the very things it forbids
 * ("no `parseFloat`"), so the scan runs on code only — otherwise the file would
 * fail the rule it documents.
 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const source = readFileSync(MODULE_PATH, 'utf8');
const code = codeOnly(source);

describe('the shared exact-money module never coerces a number', () => {
  it('contains no numeric parse, cast or rounding', () => {
    expect(code).not.toMatch(/\bNumber\(/);
    expect(code).not.toMatch(/parseFloat\(/);
    expect(code).not.toMatch(/parseInt\(/);
    expect(code).not.toMatch(/\.toFixed\(/);
    expect(code).not.toMatch(/Math\.(round|floor|ceil|abs)\(/);
    expect(code).not.toMatch(/\bBigInt\(/);
    expect(code).not.toMatch(/Intl\.NumberFormat/);
  });

  it('applies no arithmetic operator to an amount', () => {
    // The only arithmetic in the module walks *string indices* in `groupDigits`.
    // Pinned as the exact expressions rather than excluded by line number, so a
    // sum over money could not hide behind the same allowance.
    const arithmetic = code.match(/index -= GROUP_SIZE|index - GROUP_SIZE/g) ?? [];
    expect(arithmetic.length).toBeGreaterThan(0);
    const withoutIndexWalk = code
      .split('index -= GROUP_SIZE')
      .join('')
      .split('index - GROUP_SIZE')
      .join('');
    expect(withoutIndexWalk).not.toMatch(/[^\s\w'"`)\]]\s*[+\-*/]\s*[a-zA-Z_$]/);
  });

  it('is the only exact-money module in the Storefront', () => {
    // Consolidation is the point; a sixth copy reintroduces the drift that made
    // four of the five render a negative amount differently from the fifth.
    const featureCopies = [
      'src/features/secure-quotation/model/exact-money.ts',
      'src/features/secure-deposit-payment/model/exact-deposit-amount.ts',
      'src/features/secure-final-payment/model/exact-final-amount.ts',
      'src/features/ready-made-purchase/model/purchase-money.ts',
      'src/features/secure-ready-made-order/model/exact-order-amount.ts',
    ];
    for (const copy of featureCopies) {
      expect(() => readFileSync(join(__dirname, '..', '..', copy), 'utf8')).toThrow();
    }
  });
});

describe('the delivered behaviour of all four helpers is unchanged', () => {
  it('groups an amount the way every approved frame prints it', () => {
    expect(formatExactAmount('1285000.00')).toBe('1.285.000');
    expect(formatExactAmount('0.00')).toBe('0');
    expect(formatExactAmount('999')).toBe('999');
    expect(formatExactAmount('1000')).toBe('1.000');
  });

  it('returns an unrecognised or fractional amount verbatim rather than guessing', () => {
    // Hiding a non-zero fraction would be the one way this module could
    // misreport a figure the system never wrote.
    expect(formatExactAmount('1285000.50')).toBe('1285000.50');
    expect(formatExactAmount('not-a-number')).toBe('not-a-number');
    expect(formatExactAmount('')).toBe('');
  });

  it('renders a negative amount with the typographic minus the frames use', () => {
    // The drift this consolidation removed: four copies did this and
    // `ready-made-purchase` emitted an ASCII hyphen. No screen has shown a
    // negative amount, so nothing caught it.
    expect(formatExactAmount('-170000.00')).toBe('−170.000');
  });

  it('prints the currency beside the amount, never assuming VND', () => {
    expect(formatExactMoney('1285000.00', 'VND')).toBe('1.285.000 VND');
    expect(formatExactMoney('1285000.00', 'USD')).toBe('1.285.000 USD');
  });

  it('keeps a real percentage fraction and drops a zero one', () => {
    expect(formatExactPercent('40.00')).toBe('40%');
    expect(formatExactPercent('37.50')).toBe('37.5%');
    expect(formatExactPercent('nope')).toBe('nope');
  });

  it('reads zero from the digits rather than by comparing to a number', () => {
    expect(isZeroAmount('0.00')).toBe(true);
    expect(isZeroAmount('-0.00')).toBe(true);
    expect(isZeroAmount('0.01')).toBe(false);
    expect(isZeroAmount('-170000.00')).toBe(false);
    expect(isZeroAmount('nope')).toBe(false);
  });
});
