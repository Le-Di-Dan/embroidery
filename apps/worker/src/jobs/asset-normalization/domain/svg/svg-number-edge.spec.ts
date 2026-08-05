/**
 * The numeric edge corpus (`APP3-W01B-C1`).
 *
 * The defect this suite exists for: canonicalization used a fixed six-decimal
 * budget, so `1e-7` printed as `0`. Every test passed and the pipeline reached
 * a fixed point, because rounding a rounded value rounds to the same place — a
 * fixed point reached *after* rounding proves only that the rounding is stable,
 * never that the geometry survived.
 *
 * So the property asserted throughout is **binary64 round-trip identity**: the
 * canonical token parses back to the identical value, bit for bit, for every
 * value the grammar accepts — including the smallest subnormal and the largest
 * finite double. Expected tokens are written out explicitly rather than
 * snapshotted, so a change to the format has to be re-ruled rather than
 * re-recorded.
 */
import { canonicalizeSvgNumber, formatSvgNumber, parseSvgNumber } from './svg-number';
import { canonicalizeAttributeValue, parseSvgViewBox } from './svg-attribute-values';
import { canonicalizeSvgTransformList } from './svg-transform';
import { parseSvgPathData } from './path/path-parser';
import { formatSvgPathData } from './path/path-serializer';

const token = (value: number): string => formatSvgNumber(value) as string;

describe('lexical normalization', () => {
  it.each([
    ['-0', '0'],
    ['0', '0'],
    ['-0.0', '0'],
    ['-0e5', '0'],
  ])('normalizes the negative zero %s to %s', (input, expected) => {
    expect(canonicalizeSvgNumber(input)).toBe(expected);
    expect(Object.is(parseSvgNumber(input), 0)).toBe(true);
  });

  it.each([
    ['1.000', '1'],
    ['1.0', '1'],
    ['01', '1'],
    ['0001.2500', '1.25'],
    ['1.', '1'],
    ['.50', '0.5'],
  ])('removes redundant zeros: %s → %s', (input, expected) => {
    expect(canonicalizeSvgNumber(input)).toBe(expected);
  });

  it.each([
    ['1E-07', '1e-7'],
    ['1E7', '10000000'],
    ['1e+21', '1e21'],
    ['1E+21', '1e21'],
    ['1.5E+300', '1.5e300'],
    // Leading zeros in the exponent are legal input and never survive.
    ['1e-0007', '1e-7'],
    ['1e0007', '10000000'],
  ])('normalizes the exponent: %s → %s', (input, expected) => {
    expect(canonicalizeSvgNumber(input)).toBe(expected);
  });

  it('never emits a leading plus, an uppercase E or a plus in the exponent', () => {
    for (const value of [1, -1, 1e21, 1e-7, 1.5e300, 5e-324]) {
      const printed = token(value);
      expect(printed).not.toContain('+');
      expect(printed).not.toContain('E');
      expect(printed.startsWith('+')).toBe(false);
      expect(printed.trim()).toBe(printed);
    }
  });

  it('uses one consistent plain-decimal threshold', () => {
    // `Number.prototype.toString`'s own: plain for 1e-6 ≤ |v| < 1e21.
    expect(token(0.000001)).toBe('0.000001');
    expect(token(0.0000001)).toBe('1e-7');
    expect(token(1e20)).toBe('100000000000000000000');
    expect(token(1e21)).toBe('1e21');
  });
});

describe('binary64 round-trip identity', () => {
  const values = [
    0,
    1,
    -1,
    0.1,
    0.2,
    0.1 + 0.2,
    1 / 3,
    Math.PI,
    // Written in its exact binary64 spelling: `123456789.123456789` is not
    // representable, and a literal that silently becomes a different value
    // would make this suite assert the wrong thing.
    123456789.12345679,
    1e-7,
    1e21,
    // The smallest positive subnormal and the largest finite double: the two
    // ends a fixed budget destroys outright.
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    2.2250738585072014e-308,
    1.0000000000000002,
    4.9e-324,
  ];

  it.each(values.map((value) => [String(value), value]))(
    'recovers the identical value for %s',
    (_label, value) => {
      const printed = token(value);
      expect(Object.is(parseSvgNumber(printed), value === 0 ? 0 : value)).toBe(true);
    },
  );

  it('keeps adjacent binary64 values distinct', () => {
    const pairs: readonly [number, number][] = [
      [1, 1.0000000000000002],
      [0.1, 0.10000000000000002],
      [Number.MIN_VALUE, Number.MIN_VALUE * 2],
      [1e21, 1.0000000000000003e21],
    ];
    for (const [left, right] of pairs) {
      expect(left).not.toBe(right);
      expect(token(left)).not.toBe(token(right));
    }
  });

  it('retains high-precision fractions rather than rounding them', () => {
    expect(token(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(token(1 / 3)).toBe('0.3333333333333333');
    expect(canonicalizeSvgNumber('0.1234567890123')).toBe('0.1234567890123');
  });

  it('retains meaningful low-order digits in large values', () => {
    expect(canonicalizeSvgNumber('123456789.0625')).toBe('123456789.0625');
    expect(canonicalizeSvgNumber('9007199254740993')).toBe('9007199254740992');
  });

  it('never collapses a tiny non-zero value to zero', () => {
    for (const input of ['1e-7', '1e-300', '4.9e-324', '0.0000001', '-1e-9']) {
      const canonical = canonicalizeSvgNumber(input) as string;
      expect(canonical).toBeDefined();
      expect(Number(canonical)).not.toBe(0);
    }
  });

  it('is idempotent, so the fixed point is reached without rounding', () => {
    for (const value of values) {
      const once = token(value);
      expect(canonicalizeSvgNumber(once)).toBe(once);
    }
  });
});

describe('the one numeric authority reaches every value site', () => {
  it('keeps a tiny transform argument', () => {
    expect(canonicalizeSvgTransformList('translate(1e-7 -1e-9)')).toBe('translate(1e-7 -1e-9)');
    expect(canonicalizeSvgTransformList('scale(0.0000001)')).toBe('scale(1e-7)');
  });

  it('keeps a tiny path coordinate', () => {
    const commands = parseSvgPathData('M1e-7 -1e-9L0.30000000000000004 1');
    expect(formatSvgPathData(commands as never)).toBe('M1e-7 -1e-9L0.30000000000000004 1');
  });

  it('keeps a tiny points coordinate', () => {
    expect(canonicalizeAttributeValue('points', '1e-7,1e-9 2,3')).toBe('1e-7 1e-9 2 3');
  });

  it('keeps a high-precision geometry attribute', () => {
    expect(canonicalizeAttributeValue('x', '0.1234567890123')).toBe('0.1234567890123');
    expect(canonicalizeAttributeValue('stroke-width', '1e-7')).toBe('1e-7');
    expect(canonicalizeAttributeValue('opacity', '0.0000001')).toBe('1e-7');
    expect(canonicalizeAttributeValue('stroke-dasharray', '1e-7 2e-7')).toBe('1e-7 2e-7');
  });

  it('leaves the integer viewBox rule exactly as it was', () => {
    expect(parseSvgViewBox('0 0 100 50')?.width).toBe(100);
    expect(parseSvgViewBox('0 0 100.5 50')).toBeUndefined();
    expect(parseSvgViewBox('0 0 1e2 50')?.width).toBe(100);
    // A minX/minY may be fractional; only the dimensions must be integers.
    expect(parseSvgViewBox('0.5 -0.25 100 50')?.minX).toBe(0.5);
  });

  it('leaves arc flags exact, validated before any numeric canonicalization', () => {
    expect(formatSvgPathData(parseSvgPathData('M0 0a1 1 0 011 1') as never)).toBe(
      'M0 0a1 1 0 0 1 1 1',
    );
    // A flag is one character, so `1e-7` in a flag position is not a flag.
    expect(parseSvgPathData('M0 0A1 1 0 1e-7 1 1 1')).toBeUndefined();
    expect(parseSvgPathData('M0 0A1 1 0 2 1 1 1')).toBeUndefined();
  });
});

describe('strict parsing is unchanged', () => {
  it.each([
    'NaN',
    'Infinity',
    '-Infinity',
    '1e999',
    '10px',
    '50%',
    'calc(1)',
    '0x10',
    '0b1',
    '0o7',
    '1_000',
    '1,5',
    '1.2.3',
    '1e',
    '1e+',
    '1e-',
    '.',
    '+',
    '--1',
    ' 1',
    '1 ',
  ])('still refuses %s', (input) => {
    expect(parseSvgNumber(input)).toBeUndefined();
  });
});

describe('paint alpha conversion', () => {
  it.each([
    ['rgb(0 0 0 / 1)', '#000000'],
    ['rgb(0 0 0 / 0)', '#00000000'],
    // Half-steps: `round` is half-up, so 127.5 lands on 128 (0x80) and
    // 25.5 lands on 26 (0x1a) — the boundary is upward, never to-even.
    ['rgb(0 0 0 / 0.5)', '#00000080'],
    ['rgb(255 255 255 / 0.5)', '#ffffff80'],
    ['rgb(0 0 0 / 0.1)', '#0000001a'],
    ['rgb(0 0 0 / 0.501960784313725)', '#00000080'],
    ['rgb(0 0 0 / 0.25)', '#00000040'],
    // 0.75 × 255 = 191.25, which rounds down to 191 (0xbf), not up to 0xc0.
    ['rgb(0 0 0 / 0.75)', '#000000bf'],
    ['rgb(0 0 0 / 0.998)', '#000000fe'],
    // 254.745 rounds to 255, which *is* fully opaque, so the alpha is dropped —
    // the accepted `#rrggbb`/`#rrggbbaa` one-spelling rule, unchanged here.
    ['rgb(0 0 0 / 0.999)', '#000000'],
    // Alpha now shares the one numeric grammar, so exponent form is a number.
    ['rgb(0 0 0 / 1e-3)', '#00000000'],
  ])('converts %s to %s', (input, expected) => {
    expect(canonicalizeAttributeValue('fill', input)).toBe(expected);
  });

  it('still refuses an alpha outside 0..1 or in a foreign syntax', () => {
    for (const input of ['rgb(0 0 0 / 1.5)', 'rgb(0 0 0 / -0.1)', 'rgb(0 0 0 / 50%)']) {
      expect(canonicalizeAttributeValue('fill', input)).toBeUndefined();
    }
  });
});
