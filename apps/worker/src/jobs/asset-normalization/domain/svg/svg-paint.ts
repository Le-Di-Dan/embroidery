/**
 * The Template SVG paint grammar (`IMP-D047` PO-08, PO-09).
 *
 * Six accepted spellings and one canonical output form. Everything else — named
 * colours, `currentColor`, `context-fill`, `context-stroke`, `hsl()`, `lab()`,
 * `lch()`, `color()`, `device-cmyk()`, `var()` and every `url(...)` reference —
 * is rejected, because each of them is either a *reference* to something outside
 * the file or a colour space whose resolution depends on the renderer. A
 * Template that paints differently in the Studio than it did when an Admin
 * approved it is the outcome PO-05 refuses.
 *
 * `url(...)` in particular is the whole reason paint is parsed rather than
 * pattern-matched: it is the one paint value that can point at a gradient, a
 * pattern or an external document.
 */

import { parseSvgNumber } from './svg-number';

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Modern space-separated `rgb()` only. The legacy comma form is not accepted. */
const RGB_PATTERN = /^rgb\(\s*([^)]*)\)$/;

const MAX_CHANNEL = 255;

/**
 * The locked alpha → 8-bit conversion (`APP3-W01B-C1` §6).
 *
 * `round(alpha × 255)`, with JavaScript's half-up rule: a half-step lands on the
 * larger channel, so `0.5` becomes `128` (`0x80`) and not `127`. Stated as one
 * function because the boundary behaviour is a *decision*, and an implicit one
 * would let a later edit shift every translucent Template by one level. The
 * accepted paint output — `none`, `#rrggbb`, `#rrggbbaa` — is unchanged by the
 * numeric correction.
 */
function alphaToChannel(alpha: number): number {
  return Math.round(alpha * MAX_CHANNEL);
}

/** The alpha byte that means "fully opaque", and so is dropped from the output. */
const OPAQUE_ALPHA = 'ff';

function expandShortHex(digits: string): string {
  return [...digits].map((digit) => `${digit}${digit}`).join('');
}

function canonicalHex(digits: string): string {
  const lower = digits.toLowerCase();
  const expanded = lower.length <= 4 ? expandShortHex(lower) : lower;
  // A fully opaque colour has one spelling. Keeping both `#rrggbb` and
  // `#rrggbbff` would make two identical paints serialize differently.
  const withoutAlpha =
    expanded.length === 8 && expanded.endsWith(OPAQUE_ALPHA) ? expanded.slice(0, 6) : expanded;
  return `#${withoutAlpha}`;
}

function parseChannel(token: string): number | undefined {
  if (!/^\d{1,3}$/.test(token)) return undefined;
  const value = Number(token);
  return value > MAX_CHANNEL ? undefined : value;
}

/**
 * Alpha goes through the one numeric authority (`APP3-W01B-C1` §5), so an
 * alpha value obeys exactly the grammar every coordinate obeys — no second,
 * looser number syntax hiding inside a colour.
 */
function parseAlpha(token: string): number | undefined {
  const value = parseSvgNumber(token);
  if (value === undefined || value < 0 || value > 1) return undefined;
  return value;
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function parseRgbFunction(body: string): string | undefined {
  const [channelPart, alphaPart, ...extra] = body.split('/');
  if (extra.length > 0 || channelPart === undefined) return undefined;

  const channels = channelPart.trim().split(/\s+/);
  if (channels.length !== 3) return undefined;
  const values: number[] = [];
  for (const token of channels) {
    const channel = parseChannel(token);
    if (channel === undefined) return undefined;
    values.push(channel);
  }

  let alpha = '';
  if (alphaPart !== undefined) {
    const parsed = parseAlpha(alphaPart.trim());
    if (parsed === undefined) return undefined;
    const byte = alphaToChannel(parsed);
    alpha = byte === MAX_CHANNEL ? '' : toHexByte(byte);
  }

  return `#${values.map(toHexByte).join('')}${alpha}`;
}

/**
 * Canonicalizes one paint value, or returns `undefined` when it is not one.
 *
 * The output is always lowercase `none`, `#rrggbb` or `#rrggbbaa` — the three
 * forms PO-09 locks — so a downstream reader never has to implement a colour
 * parser to know what a Template paints with.
 */
export function canonicalizeSvgPaint(text: string): string | undefined {
  const value = text.trim();
  if (value === 'none') return 'none';
  if (HEX_PATTERN.test(value)) return canonicalHex(value.slice(1));

  const rgb = RGB_PATTERN.exec(value);
  if (rgb?.[1] !== undefined) return parseRgbFunction(rgb[1]);

  return undefined;
}
