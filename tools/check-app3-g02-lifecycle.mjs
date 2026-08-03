#!/usr/bin/env node
/**
 * Lifecycle-table parsing for the `APP3-G02` gate (IMP-D042).
 *
 * A sibling of `check-app3-g02.mjs`; the split is by responsibility. This file
 * owns exactly one question — *what transitions does a named lifecycle section
 * actually declare?* — and answers it from the canonical spec's own tables.
 *
 * The parser is deliberately scoped to a single `## LC-nn` section. Reading
 * transition rows across section boundaries is how a checker ends up counting
 * another lifecycle's rows and then reporting a confident, wrong number.
 */

/** `DRAFT→PUBLISHED`, with or without spaces, and with either arrow glyph. */
const ARROW_RE = /^([A-Z_()a-z ]+?)\s*(?:→|->)\s*(.+)$/;

/** The six transitions LC-24 must declare, as `id → "FROM→TO"`. */
export const EXPECTED_TEMPLATE_TRANSITIONS = Object.freeze({
  'TR-LC24-01': '(nonexistent)→DRAFT',
  'TR-LC24-02': 'DRAFT→PUBLISHED',
  'TR-LC24-03': 'PUBLISHED→DRAFT',
  'TR-LC24-04': 'DRAFT→ARCHIVED',
  'TR-LC24-05': 'PUBLISHED→ARCHIVED',
  'TR-LC24-06': 'ARCHIVED→DRAFT',
});

/**
 * Transition rows of one `## LC-nn` section as `{ id, from, to }`.
 *
 * Returns `null` when the section does not exist, so a missing lifecycle is
 * reported as missing rather than silently passing as "zero transitions".
 */
export function parseTransitions(content, lifecycleId) {
  const lines = content.split(/\r?\n/);
  const heading = new RegExp(`^##\\s+${lifecycleId}\\b`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;

  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  const section = lines.slice(start, end < 0 ? lines.length : end);

  const idPattern = new RegExp(`^TR-${lifecycleId.replace('-', '')}-\\d{2}$`);
  const transitions = [];
  for (const line of section) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll('`', ''));
    if (cells.length < 2) continue;
    const [id, arrow] = cells;
    if (!idPattern.test(id)) continue;
    const match = ARROW_RE.exec(arrow);
    if (!match) continue;
    transitions.push({ id, from: match[1].trim(), to: match[2].trim() });
  }
  return transitions;
}
