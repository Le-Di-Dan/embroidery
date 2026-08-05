/**
 * The Template SVG transform grammar (`IMP-D047` PO-10).
 *
 * Six functions, exact arity, finite arguments, degrees. No CSS transform
 * syntax, no 3D function, no `transform-origin`, no unit suffix and no
 * `calc()` — a `transform` that a CSS engine would resolve differently from an
 * SVG attribute parser is a rendering difference nobody is told about.
 *
 * Function order is preserved. Transforms do not commute, so a serializer that
 * sorted them would silently move the artwork; canonicalization here is only
 * about *spelling* — one space between arguments, one canonical number per
 * argument, no separator variation.
 */
import { formatSvgNumber, parseSvgNumber } from './svg-number';

/** The locked arities. A `translate` may take one argument or two, and no other count. */
const ARITIES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
});

export interface SvgTransform {
  readonly name: string;
  readonly args: readonly number[];
}

/**
 * Anchored at the current position and consuming exactly one function call, so
 * the parser advances by what it matched and any text it did not match is
 * trailing garbage rather than something skipped.
 */
const FUNCTION_PATTERN = /^([A-Za-z]+)\s*\(([^()]*)\)/;

const SEPARATOR_PATTERN = /^[\s,]*/;

function parseArguments(name: string, body: string): readonly number[] | undefined {
  const arities = ARITIES[name];
  if (arities === undefined) return undefined;

  const trimmed = body.trim();
  if (trimmed === '') return undefined;
  const tokens = trimmed.split(/[\s,]+/);
  if (!arities.includes(tokens.length)) return undefined;

  const args: number[] = [];
  for (const token of tokens) {
    const value = parseSvgNumber(token);
    if (value === undefined) return undefined;
    args.push(value);
  }
  return args;
}

/**
 * Parses a complete transform list, or `undefined` when any part of it is
 * illegal.
 *
 * An empty attribute is rejected rather than treated as the identity: an author
 * who wrote `transform=""` meant something, and guessing is how a Template ends
 * up positioned by a default.
 */
export function parseSvgTransformList(text: string): readonly SvgTransform[] | undefined {
  let rest = text;
  const transforms: SvgTransform[] = [];

  for (;;) {
    rest = rest.replace(SEPARATOR_PATTERN, '');
    if (rest === '') break;

    const match = FUNCTION_PATTERN.exec(rest);
    if (match?.[1] === undefined || match[2] === undefined) return undefined;

    const args = parseArguments(match[1], match[2]);
    if (args === undefined) return undefined;

    transforms.push({ name: match[1], args });
    rest = rest.slice(match[0].length);
  }

  return transforms.length === 0 ? undefined : transforms;
}

/** The canonical spelling: `name(a b c)`, single spaces, no separator variation. */
export function formatSvgTransformList(transforms: readonly SvgTransform[]): string {
  return transforms
    .map((transform) => `${transform.name}(${transform.args.map(formatSvgNumber).join(' ')})`)
    .join(' ');
}

/** Parses and canonicalizes in one step, or `undefined` when illegal. */
export function canonicalizeSvgTransformList(text: string): string | undefined {
  const transforms = parseSvgTransformList(text);
  return transforms === undefined ? undefined : formatSvgTransformList(transforms);
}
