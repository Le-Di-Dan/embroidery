/**
 * The canonical path-data form (`IMP-D047` PO-10, PO-13).
 *
 * One command letter, its arguments separated by single spaces, and no
 * separator at all between commands — a command letter is never a digit, a sign
 * or a dot, so `M0 0L10 0Z` is unambiguous to the parser that produced it. The
 * form is chosen to be *re-parseable into the same command list*, which is the
 * only property that matters: `parse(serialize(parse(d)))` must equal
 * `parse(d)`, or the fixed-point check in step 11 could never converge.
 *
 * Implicit groups are already expanded by the parser, so nothing here has to
 * decide whether to re-compress them — a decision that would have made the
 * output depend on how the input happened to be written.
 */
import { formatSvgNumber } from '../svg-number';
import type { SvgPathCommand } from './path-parser';

export function formatSvgPathData(commands: readonly SvgPathCommand[]): string | undefined {
  const parts: string[] = [];
  for (const command of commands) {
    const args: string[] = [];
    for (const value of command.args) {
      // The one numeric authority, here as everywhere: no separate serializer
      // for path parameters, so a coordinate cannot be printed by looser rules
      // than a `transform` argument (`APP3-W01B-C1`).
      const token = formatSvgNumber(value);
      if (token === undefined) return undefined;
      args.push(token);
    }
    parts.push(`${command.command}${args.join(' ')}`);
  }
  return parts.join('');
}
