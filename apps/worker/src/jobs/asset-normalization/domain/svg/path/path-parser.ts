/**
 * The grammatical half of the package-owned path parser (`IMP-D047` PO-10).
 *
 * Real SVG path grammar for `M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z/z`: exact
 * arity per command, implicit argument groups, moveto continuation, `0`/`1` arc
 * flags and full input consumption. A permissive character regex is forbidden
 * precisely because it cannot express any of that — it can only say "these
 * characters look path-like", which accepts `M0 0 L` and `A1 1 0 7 0 1 1` alike.
 *
 * The output is the canonical representation: every implicit group is expanded
 * into its own explicit command, so a re-parse of the serialized form produces
 * this exact list again. That idempotence is what step 11's fixed point rests on.
 */
import { TEMPLATE_SVG_NUMBER_ABS_MAX } from '../template-svg-policy';
import { PathScanner } from './path-tokenizer';

export interface SvgPathCommand {
  /** The command letter with its case preserved — relative is not absolute. */
  readonly command: string;
  readonly args: readonly number[];
}

const ARITY: Readonly<Record<string, number>> = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
});

/** Positions of the two arc flags inside an `A` argument group. */
const ARC_FLAG_INDEXES = new Set([3, 4]);

/** After `M x y`, a repeated group is a lineto — the spec's moveto continuation. */
const MOVETO_CONTINUATION: Readonly<Record<string, string>> = Object.freeze({
  M: 'L',
  m: 'l',
});

function arityOf(command: string): number | undefined {
  return ARITY[command.toUpperCase()];
}

function readGroup(
  scanner: PathScanner,
  command: string,
  arity: number,
): readonly number[] | undefined {
  const isArc = command.toUpperCase() === 'A';
  const args: number[] = [];

  for (let index = 0; index < arity; index += 1) {
    if (index > 0) scanner.skipCommaWhitespace();
    const value = isArc && ARC_FLAG_INDEXES.has(index) ? scanner.readFlag() : scanner.readNumber();
    if (value === undefined || Math.abs(value) > TEMPLATE_SVG_NUMBER_ABS_MAX) return undefined;
    args.push(value);
  }
  return args;
}

/**
 * Parses complete path data, or `undefined` when any part of it is illegal.
 *
 * A path that does not begin with a moveto is rejected rather than repaired:
 * the spec makes the first command a moveto, and a renderer that guesses an
 * origin would place the artwork somewhere the author never chose.
 */
export function parseSvgPathData(text: string): readonly SvgPathCommand[] | undefined {
  const scanner = new PathScanner(text);
  const commands: SvgPathCommand[] = [];

  scanner.skipWhitespace();
  if (scanner.atEnd()) return undefined;

  while (!scanner.atEnd()) {
    const command = scanner.readCommand();
    if (command === undefined) return undefined;

    const arity = arityOf(command);
    if (arity === undefined) return undefined;
    if (commands.length === 0 && command.toUpperCase() !== 'M') return undefined;

    if (arity === 0) {
      commands.push({ command, args: [] });
      scanner.skipWhitespace();
      continue;
    }

    scanner.skipWhitespace();
    let repeated = command;
    for (;;) {
      const args = readGroup(scanner, repeated, arity);
      if (args === undefined) return undefined;
      commands.push({ command: repeated, args });

      scanner.skipCommaWhitespace();
      if (!scanner.startsNumber()) break;
      repeated = MOVETO_CONTINUATION[repeated] ?? repeated;
    }
  }

  return commands;
}
