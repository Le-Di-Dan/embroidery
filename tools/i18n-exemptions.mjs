/**
 * The documented escape hatch, and the inventory of every use of it.
 *
 * `APP12-V02` gave the static-text gate a single-line exemption that must carry
 * a reason. `APP12-V02-C1` §4 adds the other half the Product Owner asked for:
 * the exemptions have to be *listed*, not counted. "The gate is green" and "the
 * gate has been widened until it is green" look identical from outside, and an
 * exemption whose reason nobody ever reads again is how the second becomes true
 * without anyone deciding it should.
 *
 * So the reason is captured rather than merely required, and printed on every
 * clean run. A reviewer sees the whole list without going looking for it, and a
 * new entry appears in the gate's own output the day it is added.
 *
 * Kept out of `check-i18n-static-text.mjs` because it is a separate
 * responsibility — the checker decides what is copy, this decides what has been
 * excused — and because the checker is at its file-size limit.
 */

/** Line ending, either platform. */
export const EOL = /\r?\n/u;

/** The single-line escape hatch, which must carry a reason. */
export const EXEMPT_COMMENT = /\/\/\s*i18n-exempt:\s*\S+/u;

/** The same hatch, with its reason captured for the inventory (§4). */
export const EXEMPT_REASON = /\/\/\s*i18n-exempt:\s*(.+)$/u;

/** Whether the line the node starts on carries the documented escape hatch. */
export function isExemptLine(sourceFile, node, lines) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return EXEMPT_COMMENT.test(lines[line] ?? '');
}

/**
 * The escape hatch honoured on a literal that lives in another file.
 *
 * Rule 4 follows a value across module boundaries, so the line to check is the
 * line the *literal* is written on, not the line that renders it. Exempting at
 * the render site would excuse every literal that ever reaches it.
 */
export function isExemptInModule(index, literal) {
  const sourceFile = index.get(literal.file);
  if (sourceFile === null) return false;
  return isExemptLine(sourceFile, literal.node, sourceFile.text.split(EOL));
}

/** Every explicit `// i18n-exempt:` in one file, with its reason. */
export function exemptionsIn(relativePath, source) {
  const out = [];
  source.split(EOL).forEach((line, index) => {
    const match = line.match(EXEMPT_REASON);
    if (match === null) return;
    out.push({
      file: relativePath,
      line: index + 1,
      reason: match[1].trim(),
      context: line.replace(EXEMPT_REASON, '').trim().slice(0, 60),
    });
  });
  return out;
}
