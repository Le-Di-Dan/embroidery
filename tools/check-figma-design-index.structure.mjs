/**
 * Document-structure invariants for the Figma Design Index gate (APP2-A03-G01-C1).
 *
 * `parseTables` only opens a table when a header line is followed by a separator
 * row. Registry-shaped lines written anywhere else — most damagingly spliced onto
 * the document title — are therefore invisible to every content rule: statuses,
 * approval evidence and duplicate IDs all go unchecked. `APP2-A03-G01` shipped
 * exactly that corruption and the gate stayed green.
 *
 * These rules close that blind spot structurally. Pure string functions, no I/O.
 */

/** The canonical registry title. The document must open with exactly this line. */
export const CANONICAL_TITLE = '# FIGMA_DESIGN_INDEX.md';

const BOM = '﻿';

/** A registry-shaped table row: leading pipe then a registry ID. */
const REGISTRY_ROW_RE = /^\|\s*`?FIG-[A-Z0-9][A-Z0-9-]*`?\s*\|/;
/** Two rows concatenated onto one line. Never legitimate anywhere. */
const CONCATENATED_ROW_RE = /\|\|\s*`?FIG-/;

/**
 * Line numbers (1-based) occupied by a parsed table: header, separator, rows.
 * Every other line is "outside a table" for placement purposes.
 */
function tableLineNumbers(tables) {
  const inTable = new Set();
  for (const t of tables) {
    inTable.add(t.headerLineNo);
    inTable.add(t.headerLineNo + 1);
    for (const row of t.rows) inTable.add(row.lineNo);
  }
  return inTable;
}

/**
 * Rule `document-title` + `row-placement`.
 * Returns violations shaped like the main checker's: { rule, line, message }.
 */
export function checkDocumentStructure(lines, tables) {
  const violations = [];
  const add = (rule, line, message) => violations.push({ rule, line, message });

  // --- Rule: the first nonblank, non-BOM line is exactly the canonical title ---
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = i === 0 ? lines[i].replace(BOM, '') : lines[i];
    if (raw.trim() !== '') {
      firstIdx = i;
      break;
    }
  }

  if (firstIdx === -1) {
    add('document-title', 0, 'Registry is empty; expected the canonical title line.');
  } else {
    const first = (firstIdx === 0 ? lines[0].replace(BOM, '') : lines[firstIdx]).trimEnd();
    if (first !== CANONICAL_TITLE) {
      const spliced = first.includes(CANONICAL_TITLE);
      add(
        'document-title',
        firstIdx + 1,
        spliced
          ? `Registry content is spliced onto the title line: the title "${CANONICAL_TITLE}" ` +
              `appears after ${first.indexOf(CANONICAL_TITLE)} characters of other content. ` +
              'Restore the title to its own line and put registry rows inside a table.'
          : `First nonblank line must be exactly "${CANONICAL_TITLE}" (found "${truncate(first)}").`,
      );
    }
  }

  // --- Rule: no registry-shaped row outside a parsed table ---
  const inTable = tableLineNumbers(tables);
  const titleLineNo = firstIdx + 1;
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = i === 0 ? lines[i].replace(BOM, '') : lines[i];
    const line = raw.trim();

    if (CONCATENATED_ROW_RE.test(line)) {
      add(
        'row-placement',
        lineNo,
        'Two registry rows are concatenated on one line ("|| FIG-"). ' +
          'Each row must occupy its own line inside a registry table.',
      );
      continue;
    }
    if (inTable.has(lineNo)) continue;
    if (REGISTRY_ROW_RE.test(line)) {
      add(
        'row-placement',
        lineNo,
        lineNo <= titleLineNo
          ? 'Registry row appears before the document title, outside every table; ' +
              'rows placed here are invisible to every status and evidence rule.'
          : 'Registry-shaped row is outside a registry table (no header/separator above it); ' +
              'it is invisible to every status and evidence rule.',
      );
    }
  }

  return violations;
}

/**
 * Rule `a03-approval`: the five `APP2-A03` Product Form screens are the named
 * implementation authority for the A03 checkpoint, so their promotion is asserted
 * explicitly rather than left to the generic status rules that the corruption
 * bypassed.
 */
export const A03_APPROVAL_EVIDENCE = 'FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001';

export const A03_REQUIRED_ROWS = [
  { id: 'FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT', node: '434:20' },
  { id: 'FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION', node: '436:37' },
  { id: 'FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING', node: '436:140' },
  { id: 'FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT', node: '438:90' },
  { id: 'FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP', node: '437:73' },
];

/**
 * `rowsById`: Map<registryId, Array<{ node, status, evidence, lineNo }>> built from
 * the parsed node-registry tables. The assertion engages only for a document that
 * already carries A03 authority, so unrelated fixtures stay valid.
 */
export function checkA03Approval(rowsById, content) {
  const engaged =
    content.includes(A03_APPROVAL_EVIDENCE) || A03_REQUIRED_ROWS.some((r) => rowsById.has(r.id));
  if (!engaged) return [];

  const violations = [];
  const add = (line, message) => violations.push({ rule: 'a03-approval', line, message });

  for (const want of A03_REQUIRED_ROWS) {
    const found = rowsById.get(want.id) ?? [];
    if (found.length === 0) {
      add(
        0,
        `A03 authority row ${want.id} (node ${want.node}) is missing from every registry table.`,
      );
      continue;
    }
    if (found.length > 1) {
      add(
        found[1].lineNo,
        `A03 authority row ${want.id} occurs ${found.length} times; exactly one canonical row is allowed.`,
      );
    }
    const row = found[0];
    if (row.node !== want.node) {
      add(row.lineNo, `A03 row ${want.id} must reference node ${want.node} (found "${row.node}").`);
    }
    if (row.status !== 'APPROVED_FOR_IMPLEMENTATION') {
      add(
        row.lineNo,
        `A03 row ${want.id} must be APPROVED_FOR_IMPLEMENTATION (found "${row.status}"); ` +
          'APP2-A03 may not be implemented from an unapproved row.',
      );
    }
    if (!row.evidence.includes(A03_APPROVAL_EVIDENCE)) {
      add(
        row.lineNo,
        `A03 row ${want.id} must carry approval evidence ${A03_APPROVAL_EVIDENCE} (found "${truncate(row.evidence)}").`,
      );
    }
  }
  return violations;
}

function truncate(value, max = 80) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
