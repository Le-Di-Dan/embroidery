#!/usr/bin/env node
/**
 * Q-01 pagination-authority consistency gate (`APP2-B04-C1`).
 *
 * `APP2-B04` shipped a keyset public catalog while every canonical DB5
 * authority still classified Q-01 as `OFFSET`. The contradiction survived a
 * whole checkpoint because nothing mechanical compared the shipped contract
 * with the documents that are supposed to govern it. This gate closes that:
 * the ADR row, the three DB5 matrices and the measured access-path evidence
 * must agree on one classification, one ordering tuple and one cursor
 * identity, and no canonical Q-01 authority may still say `OFFSET` unless the
 * line is explicitly labelled as superseded history.
 *
 * It also guards the honest half of the ruling. IDX-065 leads with
 * `category_id`, so its ordering is reachable only when that column is an
 * equality constant — which the measured evidence shows is true of neither
 * delivered form, because the public contract filters on `categories.slug`
 * across a join. A document claiming leading-prefix ordering for the
 * unfiltered listing is asserting something the planner cannot do, and that
 * claim is what this gate refuses.
 *
 * Deliberately narrow. It parses named rows in named files — it is not a
 * Markdown parser and must never become one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The documents that may state a Q-01 pagination classification. */
export const CANONICAL_FILES = Object.freeze({
  adr: 'docs/adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md',
  paginationMatrix: 'docs/database/DB5_PAGINATION_ORDERING_MATRIX.md',
  accessPathMatrix: 'docs/database/DB5_ACCESS_PATH_MATRIX.md',
  queryShapeCatalog: 'docs/database/DB5_QUERY_SHAPE_CATALOG.md',
  evidence: 'docs/database/DB5_Q01_ACCESS_PATH_EVIDENCE.md',
  indexCatalog: 'docs/database/DB5_INDEX_CATALOG.md',
  catalogIndexes: 'docs/database/DB5_INDEXES_CATALOG_GALLERY_CONTENT.md',
});

/** The ruling this gate enforces (IMP-D037). */
export const EXPECTED = Object.freeze({
  class: 'KEYSET',
  sortTuple: ['display_order', 'id'],
  cursorFields: ['display_order', 'id', 'categorySlug'],
  filteredUtility: 'EXACT_ONLY_WITH_CONSTANT_CATEGORY_ID',
  unfilteredUtility: 'NOT_LEADING_PREFIX_ORDERED',
});

/**
 * A line may still contain `OFFSET` when it is explicitly marked as history.
 * Without this the amendment itself — which must state what it supersedes —
 * would fail the gate it introduces.
 */
const HISTORY_MARKERS = ['superseded', 'historical', 'history', 'until app2-b04', 'prior to'];

/** Words that turn a mention of IDX-065 into a claim of exact support. */
const EXACTNESS_WORDS = ['exact', 'leading prefix', 'leading-prefix', 'index scan', 'no sort'];
/** Words that make such a sentence a denial rather than a claim. */
const NEGATIONS = ['not ', 'no ', "n't", 'never', 'cannot', 'without', 'rather than'];

function read(root, key) {
  return readFileSync(join(root, CANONICAL_FILES[key]), 'utf8');
}

function cells(line) {
  return line.split('|').map((cell) => cell.trim());
}

/** The single row of a pipe table whose first cell starts with `Q-01`. */
function rowStartingWith(text, prefix) {
  const matches = text.split('\n').filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) return undefined;
  return matches[0];
}

/** Identifiers in the order they appear, so `(display_order, id)` is a tuple. */
export function sortTupleOf(cellText) {
  return [...cellText.matchAll(/`?\b(display_order|id)\b`?/g)].map((match) => match[1]);
}

export function isHistoricalLine(line) {
  const lower = line.toLowerCase();
  return HISTORY_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Lines that talk about Q-01 (or, in the pagination matrix, the Q-01 row) and
 * still name `OFFSET` without labelling themselves as history.
 */
export function unlabelledOffsetLines(text) {
  return text
    .split('\n')
    .filter((line) => /Q-01/.test(line) && /OFFSET/.test(line) && !isHistoricalLine(line));
}

/**
 * Sentences claiming the unfiltered listing enjoys IDX-065's ordering.
 *
 * A denial ("the unfiltered form is **not** an ordered leading-prefix match")
 * is exactly what the documents must say, so negated lines are allowed and
 * only the affirmative claim fails.
 */
export function falseUnfilteredClaims(text) {
  return text.split('\n').filter((line) => {
    // A captured plan (`Limit → Sort → …`) reports what the planner did; it is
    // evidence, not a claim about what the index supports. Only prose asserts.
    if (line.includes('→')) return false;
    const lower = line.toLowerCase();
    if (!lower.includes('unfiltered') || !lower.includes('idx-065')) return false;
    if (!EXACTNESS_WORDS.some((word) => lower.includes(word))) return false;
    return !NEGATIONS.some((word) => lower.includes(word));
  });
}

/** `| Fact | Value |` rows of the evidence document's machine-checked table. */
export function evidenceFacts(text) {
  const facts = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const parts = cells(line);
    if (parts.length < 4) continue;
    facts.set(parts[1].replaceAll('`', ''), parts[2].replaceAll('`', '').replaceAll('*', ''));
  }
  return facts;
}

function checkAdr(text, fail) {
  const row = rowStartingWith(text, '| Q-01 product listing |');
  if (row === undefined) {
    fail(`${CANONICAL_FILES.adr}: R5 has no single \`Q-01 product listing\` row`);
    return;
  }
  const [, , classCell, sortCell] = cells(row);
  if (!classCell.includes(EXPECTED.class)) {
    fail(`ADR-DB5-001 R5 classifies Q-01 as ${classCell}, expected ${EXPECTED.class}`);
  }
  const tuple = sortTupleOf(sortCell);
  if (tuple.join(',') !== EXPECTED.sortTuple.join(',')) {
    fail(`ADR-DB5-001 R5 Q-01 sort is (${tuple.join(', ')}), expected (display_order, id)`);
  }
}

function checkPaginationMatrix(text, fail) {
  const row = rowStartingWith(text, '| Q-01 products |');
  if (row === undefined) {
    fail(`${CANONICAL_FILES.paginationMatrix}: no single \`Q-01 products\` row`);
    return;
  }
  const [, , classCell, sortCell, dirCell, tieCell, cursorCell] = cells(row);
  if (!classCell.includes(EXPECTED.class)) {
    fail(`pagination matrix classifies Q-01 as ${classCell}, expected ${EXPECTED.class}`);
  }
  if (sortTupleOf(sortCell)[0] !== 'display_order') {
    fail(`pagination matrix Q-01 sort key is ${sortCell}, expected display_order`);
  }
  if (!dirCell.includes('ASC')) {
    fail(`pagination matrix Q-01 direction is ${dirCell}, expected ASC`);
  }
  if (sortTupleOf(tieCell)[0] !== 'id') {
    fail(`pagination matrix Q-01 tie-break is ${tieCell}, expected id`);
  }
  for (const field of EXPECTED.cursorFields) {
    if (!cursorCell.includes(field)) {
      fail(`pagination matrix Q-01 cursor "${cursorCell}" is missing ${field}`);
    }
  }
}

function checkAccessPathMatrix(text, fail) {
  const row = rowStartingWith(text, '| Q-01 |');
  if (row === undefined) {
    fail(`${CANONICAL_FILES.accessPathMatrix}: no single \`Q-01\` row`);
    return;
  }
  const pagination = cells(row)[9];
  if (!pagination.includes(EXPECTED.class)) {
    fail(`access-path matrix classifies Q-01 as ${pagination}, expected ${EXPECTED.class}`);
  }
}

function checkQueryShapeCatalog(text, fail) {
  const block = text.match(/### Q-01 —[\s\S]*?(?=\n### )/);
  if (block === null) {
    fail(`${CANONICAL_FILES.queryShapeCatalog}: no \`### Q-01\` block`);
    return;
  }
  const row = rowStartingWith(block[0], '| Pagination |');
  if (row === undefined) {
    fail(`${CANONICAL_FILES.queryShapeCatalog}: Q-01 block has no single Pagination row`);
    return;
  }
  const value = cells(row)[2];
  if (!value.includes(EXPECTED.class)) {
    fail(`query-shape catalog Q-01 pagination is ${value}, expected ${EXPECTED.class}`);
  }
  if (!value.includes('categorySlug')) {
    fail(`query-shape catalog Q-01 pagination "${value}" does not bind the categorySlug filter`);
  }
}

function checkEvidence(text, fail) {
  const facts = evidenceFacts(text);
  const expectations = [
    ['Q-01 pagination class', EXPECTED.class],
    ['Q-01 order tuple', EXPECTED.sortTuple.join(', ')],
    ['Q-01 cursor identity', EXPECTED.cursorFields.join(' + ')],
    ['IDX-065 filtered utility', EXPECTED.filteredUtility],
    ['IDX-065 unfiltered utility', EXPECTED.unfilteredUtility],
  ];
  for (const [key, expected] of expectations) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.evidence}: machine-checked fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.evidence}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
}

export function checkPaginationAuthority(root = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const sources = Object.fromEntries(
    Object.keys(CANONICAL_FILES).map((key) => [key, read(root, key)]),
  );

  checkAdr(sources.adr, fail);
  checkPaginationMatrix(sources.paginationMatrix, fail);
  checkAccessPathMatrix(sources.accessPathMatrix, fail);
  checkQueryShapeCatalog(sources.queryShapeCatalog, fail);
  checkEvidence(sources.evidence, fail);

  for (const key of ['adr', 'paginationMatrix', 'accessPathMatrix', 'queryShapeCatalog']) {
    for (const line of unlabelledOffsetLines(sources[key])) {
      fail(
        `${CANONICAL_FILES[key]}: Q-01 line still says OFFSET and is not labelled history:\n    ${line.trim()}`,
      );
    }
  }

  for (const key of ['indexCatalog', 'catalogIndexes', 'evidence', 'accessPathMatrix']) {
    for (const line of falseUnfilteredClaims(sources[key])) {
      fail(
        `${CANONICAL_FILES[key]}: claims IDX-065 serves the unfiltered listing exactly:\n    ${line.trim()}`,
      );
    }
  }

  return failures;
}

function main() {
  const failures = checkPaginationAuthority();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:pagination-authority — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:pagination-authority — Q-01 is KEYSET on (display_order, id) with a categorySlug-bound cursor across 5 canonical documents; no document claims IDX-065 orders the unfiltered listing',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
