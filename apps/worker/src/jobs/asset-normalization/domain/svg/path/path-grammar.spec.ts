/**
 * The package-owned path parser (`IMP-D047` PO-10).
 *
 * The cases that matter are the ones a permissive character regex — the thing
 * PO-10 forbids — would get wrong: implicit argument groups, moveto
 * continuation, arc flags glued to the next number, and trailing garbage. Each
 * of those is a place where "looks path-like" and "is a path" diverge.
 */
import { parseSvgPathData } from './path-parser';
import { formatSvgPathData } from './path-serializer';

const canonical = (data: string): string | undefined => {
  const commands = parseSvgPathData(data);
  return commands === undefined ? undefined : formatSvgPathData(commands);
};

describe('acceptance', () => {
  it.each([
    ['M0 0Z', 'M0 0Z'],
    ['m 0 0 z', 'm0 0z'],
    ['M 0,0 L 10,0', 'M0 0L10 0'],
    ['M0 0 H10 V10 h-10 v-10', 'M0 0H10V10h-10v-10'],
    ['M0 0C1 1 2 2 3 3', 'M0 0C1 1 2 2 3 3'],
    ['M0 0S1 1 2 2', 'M0 0S1 1 2 2'],
    ['M0 0Q1 1 2 2', 'M0 0Q1 1 2 2'],
    ['M0 0T1 1', 'M0 0T1 1'],
    ['M0 0A1 1 0 0 1 2 2', 'M0 0A1 1 0 0 1 2 2'],
  ])('accepts every command family: %s', (input, expected) => {
    expect(canonical(input)).toBe(expected);
  });

  it('expands an implicit group into its own explicit command', () => {
    expect(canonical('M0 0L1 1 2 2 3 3')).toBe('M0 0L1 1L2 2L3 3');
    expect(canonical('M0 0C1 1 2 2 3 3 4 4 5 5 6 6')).toBe('M0 0C1 1 2 2 3 3C4 4 5 5 6 6');
  });

  it('continues a repeated moveto as a lineto, and keeps the case', () => {
    expect(canonical('M0 0 1 1 2 2')).toBe('M0 0L1 1L2 2');
    expect(canonical('m0 0 1 1')).toBe('m0 0l1 1');
  });

  it('reads arc flags as single characters even when nothing separates them', () => {
    // `a1 1 0 011 1` is one arc: flags `0` and `1`, then x=1, y=1. A tokenizer
    // that read `011` as a number would produce a different arc and never say so.
    expect(canonical('M0 0a1 1 0 011 1')).toBe('M0 0a1 1 0 0 1 1 1');
    expect(canonical('M0 0A1 1 0 1 0 2 2')).toBe('M0 0A1 1 0 1 0 2 2');
  });

  it('accepts the separator forms the grammar allows and prints one of them', () => {
    for (const input of ['M0,0L10,10', 'M 0 0 L 10 10', 'M0 0  L10,10', 'M0,0 L 10 , 10']) {
      expect(canonical(input)).toBe('M0 0L10 10');
    }
  });

  it('canonicalizes numbers inside path data exactly as elsewhere', () => {
    expect(canonical('M+0.0 -0L1.500000 1e1')).toBe('M0 0L1.5 10');
  });

  it('is idempotent, which the fixed point depends on', () => {
    for (const input of ['M0 0L1 1 2 2Z', 'M0 0a1 1 0 011 1', 'm0 0 1 1', 'M+0.0 -0']) {
      const once = canonical(input);
      expect(once).toBeDefined();
      expect(canonical(once as string)).toBe(once);
    }
  });
});

describe('rejection', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['no moveto first', 'L10 10'],
    ['closepath first', 'Z'],
    ['missing argument', 'M0 0L10'],
    ['trailing command letter', 'M0 0L'],
    ['trailing garbage', 'M0 0L1 1 garbage'],
    ['trailing number', 'M0 0Z 5'],
    ['unsupported command', 'M0 0B1 1'],
    ['unsupported bearing command', 'M0 0R1 1'],
    ['arc flag 2', 'M0 0A1 1 0 2 1 2 2'],
    ['arc flag 7', 'M0 0A1 1 0 7 0 1 1'],
    ['arc flag negative', 'M0 0A1 1 0 -1 0 1 1'],
    ['arc too few arguments', 'M0 0A1 1 0 0 1 2'],
    ['NaN argument', 'M0 0LNaN 1'],
    ['Infinity argument', 'M0 0LInfinity 1'],
    ['unit suffix', 'M0 0L10px 10'],
    ['percentage', 'M0 0L50% 10'],
    ['double sign', 'M0 0L--1 1'],
    ['double comma', 'M0 0L1,,1'],
    ['leading comma', 'M,0 0'],
    ['truncated exponent', 'M0 0L1e 1'],
    ['expression', 'M0 0L1+1 1'],
    ['script smuggled in', 'M0 0L1 1</path><script>alert(1)</script>'],
    ['out of range', 'M0 0L2000000000 1'],
    ['hex number', 'M0 0L0x10 1'],
  ])('refuses %s', (_label, input) => {
    expect(parseSvgPathData(input)).toBeUndefined();
  });

  it('refuses a lone dot or sign where a number is due', () => {
    for (const input of ['M. 0', 'M- 0', 'M+ 0', 'M0 0L.', 'M0 0L-']) {
      expect(parseSvgPathData(input)).toBeUndefined();
    }
  });
});
