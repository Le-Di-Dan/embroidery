/**
 * The Template SVG number grammar (`IMP-D047` PO-09, corrected by
 * `APP3-W01B-C1`).
 *
 * The semantic domain is one finite IEEE-754 **binary64** value. A token is
 * validated lexically, parsed, checked finite, normalized for `-0`, and then
 * serialized to the *shortest decimal token that parses back to the identical
 * binary64 value*. The round trip is **verified**, not assumed.
 *
 * The first delivery canonicalized to a fixed six-decimal budget. That was
 * wrong, and quietly so: `1e-7` became `0`, a tiny `translate` collapsed to the
 * identity, and a high-precision path lost its low-order digits — all while
 * every test passed and the pipeline reached a fixed point, because rounding
 * twice rounds to the same place. A Template that renders differently from the
 * one an Admin approved is exactly what PO-05 refuses, and a budget makes that
 * happen silently. Nothing here rounds, truncates, clamps or drops a digit.
 *
 * `Number.prototype.toString` is the shortest round-tripping decimal by
 * specification, so it *is* the canonical form; the only spelling it produces
 * that this policy does not want is the `+` in an exponent.
 */

/**
 * Base-10 with an optional exponent, and no other spelling.
 *
 * A leading `+` and an exponent are legal SVG source and are canonicalized on
 * output; a leading `.` and a trailing `.` are legal SVG too. Hex, octal,
 * numeric separators, `Infinity` and `NaN` are not numbers this grammar can
 * express at all, so they fail on the pattern rather than on a later check —
 * `Number()` accepts several of them, and the grammar is what decides.
 */
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** `-0` and `0` are the same coordinate; only one of them may be written. */
export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Parses one complete number, or `undefined` when the text is not one.
 *
 * No magnitude ceiling: every finite binary64 is a value this policy accepts and
 * can print. The first delivery capped magnitude only to keep
 * `Number.prototype.toString` out of exponent notation, and `IMP-D047` allows
 * lowercase exponent notation where canonical serialization needs it — so the
 * cap bought nothing and could have rejected legitimate geometry.
 */
export function parseSvgNumber(text: string): number | undefined {
  if (!NUMBER_PATTERN.test(text)) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return normalizeNegativeZero(value);
}

/**
 * The canonical spelling of a finite value, or `undefined` if it does not
 * round-trip.
 *
 * The threshold between plain decimal and exponent notation is
 * `Number.prototype.toString`'s own — plain for `1e-6 ≤ |v| < 1e21`, exponent
 * outside it — used consistently and nowhere overridden. Choosing a different
 * threshold would mean re-implementing shortest-round-trip printing, which is
 * the one thing here that must not be re-implemented.
 *
 * The `undefined` return is defence in depth: the specification guarantees the
 * round trip, so a failure would mean the runtime is not the one this policy was
 * written against, and refusing the file is the only safe answer.
 */
export function formatSvgNumber(value: number): string | undefined {
  const normalized = normalizeNegativeZero(value);
  // Lowercase `e` and no leading exponent zeros are already what the
  // specification produces; only the exponent's `+` is removed.
  const token = normalized.toString().replace('e+', 'e');
  if (!NUMBER_PATTERN.test(token)) return undefined;
  const reparsed = Number(token);
  return Object.is(reparsed, normalized) ? token : undefined;
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
export function formatNumberList(values: readonly number[]): string | undefined {
  const tokens: string[] = [];
  for (const value of values) {
    const token = formatSvgNumber(value);
    if (token === undefined) return undefined;
    tokens.push(token);
  }
  return tokens.join(' ');
}
