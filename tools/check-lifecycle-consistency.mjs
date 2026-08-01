#!/usr/bin/env node
/**
 * Lifecycle-authority consistency gate (`APP2-B03-G01`, IMP-D035).
 *
 * `APP2-B03` blocked because the APP2 pre-implementation audit asserted the
 * Product transition `DRAFT↔PUBLISHED` from *physical* representability —
 * `products.status` is a plain CHECK with no transition guard, so the column can
 * hold `DRAFT` after `PUBLISHED` — while LC-04 defined no such transition. The
 * contradiction survived every existing gate because nothing compared what an
 * implementation document claims about a lifecycle with what the lifecycle
 * specification actually defines.
 *
 * This gate closes exactly that: it reads the LC-04 transition table as a table,
 * and checks four bounded invariants against it. It is not a Markdown parser and
 * not a keyword scanner — it looks at one section of one file, one row of
 * another, and a fixed claim in the APP2 documents.
 *
 * Usage: node tools/check-lifecycle-consistency.mjs [rootDir]
 */
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import process from 'node:process';

export const LIFECYCLE_SPEC = 'docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md';
export const COMPLETENESS_MATRIX = 'docs/database/DB3_COMPLETENESS_MATRIX.md';
export const APP2_AUDIT = 'docs/implementation/audits/APP2_PRE_IMPLEMENTATION_AUDIT.md';
export const APP2_PHASE_PLAN = 'docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md';

/** The transition this repository calls "Unpublish Product". */
export const UNPUBLISH_FROM = 'PUBLISHED';
export const UNPUBLISH_TO = 'DRAFT';
/** Archive must stay a different transition with a different target. */
export const ARCHIVE_FROM = 'PUBLISHED';
export const ARCHIVE_TO = 'ARCHIVED';

const TRANSITION_ID_RE = /^TR-LC04-\d{2}$/;
/** `DRAFT→PUBLISHED`, with or without spaces around the arrow. */
const ARROW_RE = /^([A-Z_]+)\s*(?:→|->)\s*(.+)$/;

/**
 * The LC-04 transition rows, as `{ id, from, to }`.
 *
 * Parsed from the `## LC-04` section only, so a transition table belonging to
 * another lifecycle can never be counted here.
 */
export function parseLc04Transitions(content) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+LC-04\b/.test(line));
  if (start < 0) {
    return null;
  }
  const end = lines.findIndex((line, index) => index > start && /^##\s+LC-\d+\b/.test(line));
  const section = lines.slice(start, end < 0 ? lines.length : end);

  const transitions = [];
  for (const line of section) {
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2 || !TRANSITION_ID_RE.test(cells[0])) {
      continue;
    }
    const arrow = ARROW_RE.exec(cells[1]);
    transitions.push({
      id: cells[0],
      from: arrow ? arrow[1] : cells[1],
      to: arrow ? arrow[2].trim() : '',
    });
  }
  return transitions;
}

/** The declared transition count for LC-04 in the completeness matrix. */
export function parseDeclaredCount(content) {
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('| LC-04 |')) {
      continue;
    }
    const match = /\|\s*(\d+)\s*TR\s*\|/.exec(line);
    return match ? Number(match[1]) : null;
  }
  return null;
}

/**
 * Whether an APP2 document claims the Product lifecycle is bidirectional.
 *
 * This is the exact claim that blocked B03 — the audit wrote `DRAFT↔PUBLISHED`
 * before any transition authorized the return leg.
 */
export function claimsBidirectionalProductLifecycle(content) {
  return /DRAFT\s*(?:↔|<->)\s*PUBLISHED/.test(content);
}

/**
 * Whether a document says unpublish targets ARCHIVED — the forbidden reading.
 *
 * The window stops at `.`, `;`, `(` and `)` so the arrow has to be attributed to
 * unpublish itself. Without that, a sentence that correctly contrasts the two —
 * "unpublish is PUBLISHED → DRAFT; archive is PUBLISHED → ARCHIVED" — would trip
 * the rule that exists to require exactly that contrast.
 */
export function claimsUnpublishArchives(content) {
  return /unpublish[^.;\n()]{0,40}(?:→|->)\s*`?ARCHIVED/i.test(content);
}

export function checkLifecycleConsistency(files) {
  const violations = [];
  const transitions = parseLc04Transitions(files[LIFECYCLE_SPEC] ?? '');

  if (transitions === null) {
    return [`${LIFECYCLE_SPEC}: no "## LC-04" section found.`];
  }

  const unpublish = transitions.filter((t) => t.from === UNPUBLISH_FROM && t.to === UNPUBLISH_TO);
  if (unpublish.length === 0) {
    violations.push(
      `${LIFECYCLE_SPEC}: LC-04 defines no ${UNPUBLISH_FROM} → ${UNPUBLISH_TO} transition, ` +
        'so unpublish has no canonical authority (IMP-D035).',
    );
  } else if (unpublish.length > 1) {
    violations.push(
      `${LIFECYCLE_SPEC}: LC-04 defines ${unpublish.length} ${UNPUBLISH_FROM} → ${UNPUBLISH_TO} ` +
        `transitions (${unpublish.map((t) => t.id).join(', ')}); exactly one is allowed.`,
    );
  }

  if (!transitions.some((t) => t.from === ARCHIVE_FROM && t.to === ARCHIVE_TO)) {
    violations.push(
      `${LIFECYCLE_SPEC}: LC-04 must keep archive as a distinct ${ARCHIVE_FROM} → ${ARCHIVE_TO} ` +
        'transition.',
    );
  }

  const declared = parseDeclaredCount(files[COMPLETENESS_MATRIX] ?? '');
  if (declared === null) {
    violations.push(`${COMPLETENESS_MATRIX}: no LC-04 row with a transition count.`);
  } else if (declared !== transitions.length) {
    violations.push(
      `${COMPLETENESS_MATRIX}: declares LC-04 = ${declared} TR but ${LIFECYCLE_SPEC} defines ` +
        `${transitions.length}.`,
    );
  }

  const hasUnpublish = unpublish.length === 1;
  for (const path of [APP2_AUDIT, APP2_PHASE_PLAN]) {
    const content = files[path] ?? '';
    if (claimsBidirectionalProductLifecycle(content) && !hasUnpublish) {
      violations.push(
        `${path}: claims the Product lifecycle is DRAFT↔PUBLISHED, but LC-04 authorizes no ` +
          'return transition. Physical representability is not lifecycle authority.',
      );
    }
    if (claimsUnpublishArchives(content)) {
      violations.push(
        `${path}: documents unpublish as targeting ARCHIVED. Unpublish is ` +
          `${UNPUBLISH_FROM} → ${UNPUBLISH_TO}; archive is a separate action (IMP-D035).`,
      );
    }
  }

  return violations;
}

const WATCHED = [LIFECYCLE_SPEC, COMPLETENESS_MATRIX, APP2_AUDIT, APP2_PHASE_PLAN];

function main() {
  const root = process.argv[2] ?? process.cwd();
  const files = {};
  for (const path of WATCHED) {
    files[path] = readFileSync(join(root, path), 'utf8');
  }

  const violations = checkLifecycleConsistency(files);
  if (violations.length > 0) {
    console.error('Lifecycle-consistency check failed:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }

  const transitions = parseLc04Transitions(files[LIFECYCLE_SPEC]);
  console.log(
    `Lifecycle-consistency check passed (LC-04: ${transitions.length} transitions, ` +
      'exactly one PUBLISHED → DRAFT unpublish, archive distinct, APP2 documents agree).',
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  main();
}
