/**
 * Per-attribute value validation and canonicalization (`IMP-D047` PO-09, PO-10).
 *
 * Every allowed attribute has exactly one validator here, and an attribute with
 * no entry is rejected rather than passed through. That default matters more
 * than any single rule: a widening of the *name* allowlist without a matching
 * value grammar would otherwise admit an unvalidated string, which is how a
 * `style`-shaped payload reaches a renderer.
 *
 * Each validator returns the canonical spelling, or `undefined` for "this file
 * is rejected". None of them repairs, clamps or truncates a value — PO-05 makes
 * whole-file rejection the only answer, because a Template that renders
 * differently from the one an Admin approved is a silent failure.
 */
import { canonicalizeSvgPaint } from './svg-paint';
import { canonicalizeSvgTransformList } from './svg-transform';
import { formatNumberList, formatSvgNumber, parseNumberList, parseSvgNumber } from './svg-number';
import { formatSvgPathData } from './path/path-serializer';
import { parseSvgPathData } from './path/path-parser';
import { TEMPLATE_SVG_ENUMS, TEMPLATE_SVG_VIEWBOX_LIMITS } from './template-svg-policy';

/** A polyline needs two points, so four coordinates is the smallest legal list. */
const MIN_POINT_COORDINATES = 4;

const VIEWBOX_VALUES = 4;

type Validator = (value: string) => string | undefined;

function number(predicate: (value: number) => boolean): Validator {
  return (value) => {
    const parsed = parseSvgNumber(value.trim());
    if (parsed === undefined || !predicate(parsed)) return undefined;
    return formatSvgNumber(parsed);
  };
}

/** Every geometry, opacity, stroke and dash value goes through `number`. */

function enumeration(attribute: string): Validator {
  const allowed = TEMPLATE_SVG_ENUMS[attribute] ?? [];
  return (value) => (allowed.includes(value.trim()) ? value.trim() : undefined);
}

const anyNumber = number(() => true);
const nonNegative = number((value) => value >= 0);
const positive = number((value) => value > 0);
const unitInterval = number((value) => value >= 0 && value <= 1);

/**
 * A dash pattern is a non-empty list of non-negative numbers and nothing else.
 *
 * `none` is deliberately not accepted: it is the initial value, so an author who
 * means "no dashes" omits the attribute. Admitting a second spelling of the
 * default would put a value in the canonical output that changes nothing.
 */
const dashArray: Validator = (value) => {
  const values = parseNumberList(value);
  if (values === undefined || values.some((entry) => entry < 0)) return undefined;
  return formatNumberList(values);
};

const points: Validator = (value) => {
  const values = parseNumberList(value);
  if (values === undefined) return undefined;
  if (values.length < MIN_POINT_COORDINATES || values.length % 2 !== 0) return undefined;
  return formatNumberList(values);
};

const pathData: Validator = (value) => {
  const commands = parseSvgPathData(value);
  return commands === undefined ? undefined : formatSvgPathData(commands);
};

const VALIDATORS: Readonly<Record<string, Validator>> = Object.freeze({
  transform: (value) => canonicalizeSvgTransformList(value),
  fill: (value) => canonicalizeSvgPaint(value),
  stroke: (value) => canonicalizeSvgPaint(value),
  'fill-opacity': unitInterval,
  'stroke-opacity': unitInterval,
  opacity: unitInterval,
  'fill-rule': enumeration('fill-rule'),
  'stroke-linecap': enumeration('stroke-linecap'),
  'stroke-linejoin': enumeration('stroke-linejoin'),
  'stroke-width': nonNegative,
  'stroke-dashoffset': nonNegative,
  'stroke-miterlimit': positive,
  'stroke-dasharray': dashArray,
  x: anyNumber,
  y: anyNumber,
  cx: anyNumber,
  cy: anyNumber,
  x1: anyNumber,
  y1: anyNumber,
  x2: anyNumber,
  y2: anyNumber,
  width: nonNegative,
  height: nonNegative,
  r: nonNegative,
  rx: nonNegative,
  ry: nonNegative,
  points,
  d: pathData,
});

/** Canonicalizes one allowed attribute, or `undefined` when the file is rejected. */
export function canonicalizeAttributeValue(name: string, value: string): string | undefined {
  const validator = VALIDATORS[name];
  return validator === undefined ? undefined : validator(value);
}

export interface SvgViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Parses the root `viewBox`, which is also the derivative's dimensions (PO-10).
 *
 * The width and height must be **positive integers**, not merely positive
 * numbers, because `width_px` and `height_px` are derived from them with no
 * rounding and no DPI. A fractional viewBox would force a rounding rule, and a
 * rounding rule is a place where the recorded dimensions and the delivered
 * artwork can disagree.
 */
export function parseSvgViewBox(value: string): SvgViewBox | undefined {
  const values = parseNumberList(value);
  if (values === undefined || values.length !== VIEWBOX_VALUES) return undefined;

  const [minX, minY, width, height] = values as [number, number, number, number];
  if (!Number.isInteger(width) || !Number.isInteger(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  if (width > TEMPLATE_SVG_VIEWBOX_LIMITS.maxWidth) return undefined;
  if (height > TEMPLATE_SVG_VIEWBOX_LIMITS.maxHeight) return undefined;
  if (width * height > TEMPLATE_SVG_VIEWBOX_LIMITS.maxPixels) return undefined;

  return { minX, minY, width, height };
}

export function formatSvgViewBox(viewBox: SvgViewBox): string | undefined {
  return formatNumberList([viewBox.minX, viewBox.minY, viewBox.width, viewBox.height]);
}
