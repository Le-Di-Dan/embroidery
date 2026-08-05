/**
 * The Template SVG number grammar (`IMP-D047` PO-09).
 *
 * Every numeric value in the policy passes through here, and the two halves are
 * deliberately separate: `parseSvgNumber` decides whether a *string* is a legal
 * number, and `formatSvgNumber` decides how a legal number is *written*. A
 * validator that also formatted would be free to accept something it could not
 * reproduce, and step 11's fixed point would be the thing that discovered it.
 *
 * Nothing here accepts a unit, a percentage, `calc()`, `NaN`, `Infinity` or
 * trailing garbage. The full input must be the number: a partial match is how a
 * value like `10px` or `1;alert(1)` becomes "10".
 */
import { TEMPLATE_SVG_NUMBER_ABS_MAX, TEMPLATE_SVG_NUMBER_DECIMALS } from './template-svg-policy';

/**
 * Base-10 with an optional exponent, and no other spelling.
 *
 * A leading `+` and an exponent are legal SVG source and are canonicalized away
 * on output; a leading `.` and a trailing `.` are legal SVG too. Hex, octal,
 * `Infinity` and `NaN` are not numbers this grammar can express at all, so they
 * fail on the pattern rather than on a later `isFinite` check.
 */
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parses one complete number, or `undefined` when the text is not one. */
export function parseSvgNumber(text: string): number | undefined {
  if (!NUMBER_PATTERN.test(text)) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  if (Math.abs(value) > TEMPLATE_SVG_NUMBER_ABS_MAX) return undefined;
  return value;
}

/**
 * The canonical spelling of a legal number.
 *
 * Fixed to the policy's decimal budget and then stripped of the zeros that
 * budget added, so `1`, `1.0`, `+1e0` and `1.0000000` all print as `1` — one
 * representation per value. `-0` prints as `0`: the two are the same coordinate
 * and printing both would make an accepted file's output depend on which one a
 * producer happened to emit.
 */
export function formatSvgNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  const fixed = value.toFixed(TEMPLATE_SVG_NUMBER_DECIMALS);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  // `-0.0000001` rounds to `-0.000000`, whose trimmed form is `-0`.
  return trimmed === '-0' || trimmed === '' ? '0' : trimmed;
}

/** Parses and canonicalizes in one step, or `undefined` when illegal. */
export function canonicalizeSvgNumber(text: string): string | undefined {
  const value = parseSvgNumber(text);
  return value === undefined ? undefined : formatSvgNumber(value);
}

/**
 * Splits an SVG number list on the locked separators.
 *
 * Whitespace, or **one** comma with optional whitespace around it — exactly what
 * the SVG list grammar allows. Splitting on `[\s,]+` instead would collapse a
 * repeated separator, so `1,,2` would silently become the two-number list
 * `1 2`; here it produces an empty token, and an empty token is not a number.
 */
export function splitNumberList(text: string): readonly string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  return trimmed.split(/\s*,\s*|\s+/);
}

/** Parses a complete list of numbers, or `undefined` when any member is illegal. */
export function parseNumberList(text: string): readonly number[] | undefined {
  const tokens = splitNumberList(text);
  if (tokens.length === 0) return undefined;
  const values: number[] = [];
  for (const token of tokens) {
    const value = parseSvgNumber(token);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

/** The canonical list form: single spaces, canonical members, no trailing space. */
export function formatNumberList(values: readonly number[]): string {
  return values.map(formatSvgNumber).join(' ');
}
