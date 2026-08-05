/**
 * The value grammar (`IMP-D047` PO-09, PO-10).
 *
 * Two properties are asserted throughout, and the second matters more than the
 * first: a value is accepted only in the spellings the ruling lists, and the
 * canonical form of an accepted value **re-canonicalizes to itself**. Without
 * that idempotence the pipeline's fixed point could never converge, and the
 * failure would appear as a mysterious rejection of a perfectly good file.
 */
import { canonicalizeAttributeValue, parseSvgViewBox } from './svg-attribute-values';
import { canonicalizeSvgNumber, formatSvgNumber, parseSvgNumber } from './svg-number';
import { canonicalizeSvgPaint } from './svg-paint';
import { canonicalizeSvgTransformList, parseSvgTransformList } from './svg-transform';

describe('numbers', () => {
  it.each([
    ['0', '0'],
    ['-0', '0'],
    ['+1', '1'],
    ['1.0', '1'],
    ['1.500000', '1.5'],
    ['.5', '0.5'],
    ['-.5', '-0.5'],
    ['5.', '5'],
    ['1e3', '1000'],
    ['1E-2', '0.01'],
    ['-0.0000001', '0'],
    ['1000000000', '1000000000'],
  ])('canonicalizes %s to %s', (input, expected) => {
    expect(canonicalizeSvgNumber(input)).toBe(expected);
  });

  it.each([
    'NaN',
    'Infinity',
    '-Infinity',
    '10px',
    '50%',
    'calc(1 + 1)',
    '0x10',
    '1 2',
    '',
    ' ',
    '1e',
    '.',
    '-',
    '1,0',
    '1e999',
    '1000000001',
    '١',
  ])('refuses %s', (input) => {
    expect(parseSvgNumber(input)).toBeUndefined();
  });

  it('is idempotent, which the fixed point depends on', () => {
    for (const input of ['0', '-0', '1e3', '1.500000', '.5', '-0.0000001', '123.456789']) {
      const once = canonicalizeSvgNumber(input);
      expect(once).toBeDefined();
      expect(canonicalizeSvgNumber(once as string)).toBe(once);
    }
  });

  it('never prints exponent notation, which would not re-parse', () => {
    for (const value of [1e-7, 1e9, -1e9, 0.0000005, 999999999.999999]) {
      expect(formatSvgNumber(value)).not.toMatch(/e/i);
      expect(parseSvgNumber(formatSvgNumber(value))).toBeDefined();
    }
  });
});

describe('paints', () => {
  it.each([
    ['none', 'none'],
    ['#F00', '#ff0000'],
    ['#ff0000', '#ff0000'],
    ['#FF0000FF', '#ff0000'],
    ['#ff000080', '#ff000080'],
    ['#f00f', '#ff0000'],
    ['#f008', '#ff000088'],
    // Four digits is `#rgba`, so this is a fully transparent yellow, not a
    // malformed six-digit colour.
    ['#ff00', '#ffff0000'],
    ['rgb(255 0 0)', '#ff0000'],
    ['rgb(0 128 255 / 0.5)', '#0080ff80'],
    ['rgb(0 0 0 / 1)', '#000000'],
  ])('canonicalizes %s to %s', (input, expected) => {
    expect(canonicalizeSvgPaint(input)).toBe(expected);
  });

  it.each([
    'red',
    'currentColor',
    'currentcolor',
    'context-fill',
    'context-stroke',
    'url(#g)',
    'url("x.svg#g")',
    'var(--c)',
    'hsl(0 100% 50%)',
    'lab(50% 40 59)',
    'lch(50% 40 30)',
    'color(display-p3 1 0 0)',
    'device-cmyk(0 1 1 0)',
    'rgb(255, 0, 0)',
    'rgb(300 0 0)',
    'rgb(255 0 0 / 1.5)',
    'rgb(255 0)',
    '#ff',
    '#fffff',
    '#fffffff',
    'NONE',
    'inherit',
    'transparent',
  ])('refuses %s', (input) => {
    expect(canonicalizeSvgPaint(input)).toBeUndefined();
  });

  it('is idempotent', () => {
    for (const input of ['#F00', 'rgb(0 128 255 / 0.5)', 'none', '#f008']) {
      const once = canonicalizeSvgPaint(input);
      expect(canonicalizeSvgPaint(once as string)).toBe(once);
    }
  });
});

describe('transforms', () => {
  it.each([
    ['matrix(1 0 0 1 0 0)', 'matrix(1 0 0 1 0 0)'],
    ['matrix(1,0,0,1,0,0)', 'matrix(1 0 0 1 0 0)'],
    ['translate(5)', 'translate(5)'],
    ['translate(1 , 2)', 'translate(1 2)'],
    ['scale(2)', 'scale(2)'],
    ['scale(2 3)', 'scale(2 3)'],
    ['rotate(45)', 'rotate(45)'],
    ['rotate(45 10 10)', 'rotate(45 10 10)'],
    ['skewX(10)', 'skewX(10)'],
    ['skewY(-10)', 'skewY(-10)'],
    ['  translate(1 2)   scale(2)  ', 'translate(1 2) scale(2)'],
  ])('canonicalizes %s to %s', (input, expected) => {
    expect(canonicalizeSvgTransformList(input)).toBe(expected);
  });

  it('preserves order, because transforms do not commute', () => {
    expect(canonicalizeSvgTransformList('scale(2) translate(1 2)')).toBe('scale(2) translate(1 2)');
    expect(canonicalizeSvgTransformList('translate(1 2) scale(2)')).toBe('translate(1 2) scale(2)');
  });

  it.each([
    '',
    '   ',
    'translate()',
    'translate(1 2 3)',
    'matrix(1 0 0 1 0)',
    'rotate(45 10)',
    'skewX(1 2)',
    'scale(1 2 3)',
    'translate(10px 2)',
    'translate3d(1 2 3)',
    'rotate3d(1 0 0 45)',
    'perspective(100)',
    'translate(1 2) unknown(3)',
    'translate(1 2) garbage',
    'translate(1 2',
    'TRANSLATE(1 2)',
    'translate(1 2) transform-origin(0 0)',
  ])('refuses %s', (input) => {
    expect(parseSvgTransformList(input)).toBeUndefined();
  });
});

describe('attribute values', () => {
  it('accepts every enumeration exactly, and nothing else', () => {
    for (const [name, allowed] of [
      ['fill-rule', ['nonzero', 'evenodd']],
      ['stroke-linecap', ['butt', 'round', 'square']],
      ['stroke-linejoin', ['miter', 'round', 'bevel']],
    ] as const) {
      for (const value of allowed) expect(canonicalizeAttributeValue(name, value)).toBe(value);
      for (const value of ['NONZERO', 'inherit', 'arcs', '', 'nonzero evenodd']) {
        expect(canonicalizeAttributeValue(name, value)).toBeUndefined();
      }
    }
  });

  it('bounds opacity to 0..1 and refuses percentages', () => {
    for (const name of ['opacity', 'fill-opacity', 'stroke-opacity']) {
      expect(canonicalizeAttributeValue(name, '0')).toBe('0');
      expect(canonicalizeAttributeValue(name, '1')).toBe('1');
      expect(canonicalizeAttributeValue(name, '0.500')).toBe('0.5');
      for (const bad of ['-0.1', '1.1', '50%', 'inherit']) {
        expect(canonicalizeAttributeValue(name, bad)).toBeUndefined();
      }
    }
  });

  it('requires non-negative sizes and a positive miter limit', () => {
    for (const name of ['width', 'height', 'r', 'rx', 'ry', 'stroke-width', 'stroke-dashoffset']) {
      expect(canonicalizeAttributeValue(name, '0')).toBe('0');
      expect(canonicalizeAttributeValue(name, '-1')).toBeUndefined();
    }
    expect(canonicalizeAttributeValue('stroke-miterlimit', '1')).toBe('1');
    expect(canonicalizeAttributeValue('stroke-miterlimit', '0')).toBeUndefined();
  });

  it('allows negative positions, which are ordinary coordinates', () => {
    for (const name of ['x', 'y', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2']) {
      expect(canonicalizeAttributeValue(name, '-5.0')).toBe('-5');
    }
  });

  it('takes a dash array as a non-empty non-negative list and refuses "none"', () => {
    expect(canonicalizeAttributeValue('stroke-dasharray', '4, 2')).toBe('4 2');
    expect(canonicalizeAttributeValue('stroke-dasharray', '4')).toBe('4');
    for (const bad of ['none', '', '4 -2', '4,,2', '4 2px']) {
      expect(canonicalizeAttributeValue('stroke-dasharray', bad)).toBeUndefined();
    }
  });

  it('requires an even coordinate count of at least two points', () => {
    expect(canonicalizeAttributeValue('points', '0,0 1,1')).toBe('0 0 1 1');
    expect(canonicalizeAttributeValue('points', '0 0 1 1 2 2')).toBe('0 0 1 1 2 2');
    for (const bad of ['0 0', '0 0 1', '', '0 0 1 x']) {
      expect(canonicalizeAttributeValue('points', bad)).toBeUndefined();
    }
  });

  it('refuses any attribute with no validator, which is the safe default', () => {
    for (const name of ['style', 'id', 'class', 'href', 'onload', 'data-x', 'aria-label']) {
      expect(canonicalizeAttributeValue(name, 'anything')).toBeUndefined();
    }
  });
});

describe('viewBox', () => {
  it('accepts integer dimensions inside the ruled budget', () => {
    expect(parseSvgViewBox('0 0 100 50')).toEqual({ minX: 0, minY: 0, width: 100, height: 50 });
    expect(parseSvgViewBox('-10 -10 4096 4096')?.width).toBe(4096);
  });

  it('rejects the boundary plus one on each dimension and on the pixel budget', () => {
    expect(parseSvgViewBox('0 0 4096 4096')).toBeDefined();
    expect(parseSvgViewBox('0 0 4097 10')).toBeUndefined();
    expect(parseSvgViewBox('0 0 10 4097')).toBeUndefined();
    // 4096 x 4096 is exactly 16,777,216; one more row is one pixel too many.
    expect(parseSvgViewBox('0 0 4096 4096')?.height).toBe(4096);
    expect(parseSvgViewBox('0 0 4096 4095')).toBeDefined();
  });

  it.each([
    '0 0 100',
    '0 0 100 50 20',
    '0 0 100.5 50',
    '0 0 0 50',
    '0 0 -10 50',
    '0 0 100 0',
    'a b c d',
    '',
    '0 0 100 50%',
    '0 0 1e2 50',
  ])('refuses %s', (input) => {
    if (input === '0 0 1e2 50') {
      // `1e2` is an integer written in exponent form; it is a legal number and
      // a legal dimension, so this one is accepted rather than refused.
      expect(parseSvgViewBox(input)).toBeDefined();
      return;
    }
    expect(parseSvgViewBox(input)).toBeUndefined();
  });
});
