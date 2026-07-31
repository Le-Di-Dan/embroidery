#!/usr/bin/env node
/**
 * Figma Design Index consistency gate (APP1-D01).
 *
 * Statically validates the canonical Figma registry
 * `docs/design/FIGMA_DESIGN_INDEX.md` so every design and frontend checkpoint
 * can trust it: canonical file keys, unique registry IDs, allowed statuses,
 * required columns, exact deep links whose file-key and node-id match the row,
 * canonical composite-key uniqueness, valid supersession, no invented links on
 * MISSING rows, approval evidence on APPROVED rows, phase-plan back-references,
 * and no leaked token / personal email / tracker `t=` parameter.
 *
 * Cross-platform (Windows + Linux): pure Node, no shell, no network. Never
 * modifies files. Non-zero exit on any violation.
 *
 * Usage: node tools/check-figma-design-index.mjs [rootDir]
 * The optional rootDir argument exists so the checker itself is testable.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import process from 'node:process';
import {
  parseTables,
  cell,
  extractUrl,
  fileKeyFromUrl,
  nodeIdFromUrl,
} from './check-figma-design-index.parse.mjs';
import { checkDocumentStructure, checkA03Approval } from './check-figma-design-index.structure.mjs';

export const INDEX_PATH = 'docs/design/FIGMA_DESIGN_INDEX.md';
export const PHASE_PLAN_PATH = 'docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md';

// The two canonical Figma files. Their keys are the only ones allowed in links.
export const CANONICAL_FILE_KEYS = {
  BQwqV8GdfUIELvsQDB1UQE: 'FIG-FILE-PRODUCT',
  hsxSjwkqQKM9vuyRgWSesU: 'FIG-FILE-DS',
};

export const ALLOWED_STATUSES = new Set([
  'APPROVED',
  'APPROVED_FOR_IMPLEMENTATION',
  'REVIEW_REQUIRED',
  'DRAFT',
  'UNVERIFIED',
  'REFERENCE_ONLY',
  'SUPERSEDED',
  'OBSOLETE',
  'MISSING',
]);

// Statuses that occupy the single canonical slot for a composite key.
const CANONICAL_STATUSES = new Set([
  'APPROVED',
  'APPROVED_FOR_IMPLEMENTATION',
  'REVIEW_REQUIRED',
  'DRAFT',
]);

const EVIDENCE_STATUSES = new Set(['APPROVED', 'APPROVED_FOR_IMPLEMENTATION']);

const REGISTRY_ID_RE = /^FIG-[A-Z0-9][A-Z0-9-]*$/;
const NODE_ID_RE = /^\d+:\d+$/;

// Columns every node-registry table must declare (order-independent).
export const REQUIRED_NODE_COLUMNS = [
  'Registry ID',
  'App/Library',
  'Route/Capability',
  'Screen/Asset',
  'State',
  'Viewport',
  'Class',
  'Status',
  'File Key',
  'Page',
  'Node',
  'Direct URL',
  'Owning Phase',
  'Supersedes/By',
  'Approval Evidence',
  'Last Verified',
];

// Secrets/identity that must never be committed into the canonical index.
const FORBIDDEN_SUBSTRINGS = ['access_token', 'client_secret'];
// Any email address is a personal-identity leak; the index carries none.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Validate the registry. Returns { violations, stats }.
 * Each violation is { rule, line, message }.
 */
export function checkFigmaDesignIndex(rootDir) {
  const violations = [];
  const add = (rule, line, message) => violations.push({ rule, line, message });

  const indexAbs = join(rootDir, INDEX_PATH);
  if (!existsSync(indexAbs)) {
    add('index-exists', 0, `Missing canonical registry ${INDEX_PATH}.`);
    return { violations, stats: { registryIds: 0, nodeRows: 0, tables: 0 } };
  }

  const content = readFileSync(indexAbs, 'utf8');
  const lines = content.split('\n');
  const tables = parseTables(lines);

  // --- Rule 1/2: document title + registry rows only inside registry tables ---
  // Rows written outside a table are invisible to every rule below, so this runs first.
  violations.push(...checkDocumentStructure(lines, tables));

  // --- Rule 16/17: no secrets, personal email, or tracker params ---
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    const idx = content.indexOf(needle);
    if (idx !== -1) {
      add(
        'no-secret',
        content.slice(0, idx).split('\n').length,
        `Forbidden value "${needle}" in the index.`,
      );
    }
  }
  const emailMatch = EMAIL_RE.exec(content);
  if (emailMatch) {
    add(
      'no-secret',
      content.slice(0, emailMatch.index).split('\n').length,
      `Personal email "${emailMatch[0]}" must not appear in the index.`,
    );
  }
  for (const m of content.matchAll(/https?:\/\/www\.figma\.com\/[^\s)]*/g)) {
    if (/[?&]t=/.test(m[0])) {
      add(
        'no-tracker-param',
        content.slice(0, m.index).split('\n').length,
        'Figma link carries a temporary "t=" tracker parameter; strip it from canonical links.',
      );
    }
  }

  // --- File catalog: exactly one row per canonical key ---
  const catalogTables = tables.filter((t) => t.colIndex['Write Authority'] !== undefined);
  const keyCounts = new Map();
  for (const t of catalogTables) {
    for (const row of t.rows) {
      const key = cell(row, t.colIndex, 'File Key');
      if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  for (const key of Object.keys(CANONICAL_FILE_KEYS)) {
    const n = keyCounts.get(key) ?? 0;
    if (n !== 1) {
      add(
        'file-catalog',
        0,
        `Canonical file key ${key} must be declared exactly once in the file catalog (found ${n}).`,
      );
    }
  }

  // --- Node-registry tables (share the required schema) ---
  const nodeTables = tables.filter(
    (t) => t.colIndex['Registry ID'] !== undefined && t.colIndex['Direct URL'] !== undefined,
  );

  const allRegistryIds = new Set();
  const seenIds = new Set();
  const canonicalComposites = new Map();
  // Every row keyed by registry ID, so named-authority assertions can see duplicates.
  const rowsById = new Map();
  let nodeRowCount = 0;

  // First pass: collect every registry ID across all node tables (for supersession refs).
  for (const t of nodeTables) {
    for (const row of t.rows) {
      const id = cell(row, t.colIndex, 'Registry ID').replace(/`/g, '');
      if (id) allRegistryIds.add(id);
    }
  }

  for (const t of nodeTables) {
    // Rule 6: required columns exist.
    for (const col of REQUIRED_NODE_COLUMNS) {
      if (t.colIndex[col] === undefined) {
        add(
          'required-columns',
          t.headerLineNo,
          `Node-registry table is missing required column "${col}".`,
        );
      }
    }

    for (const row of t.rows) {
      const id = cell(row, t.colIndex, 'Registry ID').replace(/`/g, '');
      const status = cell(row, t.colIndex, 'Status');
      const fileKey = cell(row, t.colIndex, 'File Key').replace(/`/g, '');
      const page = cell(row, t.colIndex, 'Page');
      const node = cell(row, t.colIndex, 'Node').replace(/`/g, '');
      const urlCell = cell(row, t.colIndex, 'Direct URL');
      const url = extractUrl(urlCell);
      const evidence = cell(row, t.colIndex, 'Approval Evidence');
      const supersede = cell(row, t.colIndex, 'Supersedes/By').replace(/`/g, '');

      if (!id) continue; // spacer/comment row
      nodeRowCount += 1;

      if (!rowsById.has(id)) rowsById.set(id, []);
      rowsById.get(id).push({ node, status, evidence, lineNo: row.lineNo });

      // Rule 3: registry IDs unique + well-formed.
      if (!REGISTRY_ID_RE.test(id)) {
        add('registry-id-format', row.lineNo, `Registry ID "${id}" must match FIG-[A-Z0-9-].`);
      }
      if (seenIds.has(id)) {
        add('registry-id-unique', row.lineNo, `Duplicate registry ID "${id}".`);
      }
      seenIds.add(id);

      // Rule 4: allowed statuses only.
      if (!ALLOWED_STATUSES.has(status)) {
        add('status', row.lineNo, `Row "${id}" has invalid status "${status}".`);
      }

      if (status === 'MISSING') {
        // Rule 12: MISSING rows invent no link.
        if (node || nodeIdFromUrl(url)) {
          add(
            'missing-no-link',
            row.lineNo,
            `MISSING row "${id}" must not carry a node id or deep link.`,
          );
        }
      } else {
        // Rule: non-missing rows have file key, page, node, exact deep link.
        if (!fileKey) add('node-fields', row.lineNo, `Row "${id}" missing File Key.`);
        if (!page) add('node-fields', row.lineNo, `Row "${id}" missing Page.`);
        if (!node) add('node-fields', row.lineNo, `Row "${id}" missing Node.`);
        if (node && !NODE_ID_RE.test(node)) {
          add(
            'node-format',
            row.lineNo,
            `Row "${id}" Node "${node}" must be Figma colon form (e.g. 371:3).`,
          );
        }
        if (!url) {
          add('node-fields', row.lineNo, `Row "${id}" missing a Direct URL.`);
        } else {
          // Rule 15: must be a node deep link, not file-level only.
          if (!/[?&]node-id=/.test(url)) {
            add(
              'deep-link',
              row.lineNo,
              `Row "${id}" Direct URL must be a node deep link (?node-id=…).`,
            );
          }
          // Rule 7: URL file key matches row.
          const urlKey = fileKeyFromUrl(url);
          if (fileKey && urlKey && urlKey !== fileKey) {
            add(
              'url-file-key',
              row.lineNo,
              `Row "${id}" URL file key ${urlKey} ≠ row File Key ${fileKey}.`,
            );
          }
          if (urlKey && !(urlKey in CANONICAL_FILE_KEYS)) {
            add(
              'url-file-key',
              row.lineNo,
              `Row "${id}" URL points at non-canonical file ${urlKey}.`,
            );
          }
          // Rule 8/9: URL node id matches row node id (colon↔hyphen).
          const urlNode = nodeIdFromUrl(url);
          if (node && urlNode && urlNode !== node.replace(':', '-')) {
            add('url-node-id', row.lineNo, `Row "${id}" URL node ${urlNode} ≠ row Node ${node}.`);
          }
        }

        // Rule 13: APPROVED rows need evidence.
        if (EVIDENCE_STATUSES.has(status) && !evidence) {
          add(
            'approval-evidence',
            row.lineNo,
            `Row "${id}" is ${status} but has no Approval Evidence.`,
          );
        }

        // Rule 10/12.6: one canonical entry per composite key.
        if (CANONICAL_STATUSES.has(status)) {
          const composite = [
            cell(row, t.colIndex, 'App/Library'),
            cell(row, t.colIndex, 'Route/Capability'),
            cell(row, t.colIndex, 'Screen/Asset'),
            cell(row, t.colIndex, 'State'),
            cell(row, t.colIndex, 'Viewport'),
          ]
            .join(' | ')
            .toLowerCase();
          if (canonicalComposites.has(composite)) {
            add(
              'composite-unique',
              row.lineNo,
              `Row "${id}" duplicates canonical composite already held by "${canonicalComposites.get(composite)}".`,
            );
          } else {
            canonicalComposites.set(composite, id);
          }
        }
      }

      // Rule 11: SUPERSEDED rows point to a real replacement.
      if (status === 'SUPERSEDED') {
        const ref = supersede.replace(/^→\s*/, '').trim();
        if (!ref || !allRegistryIds.has(ref)) {
          add(
            'supersede-ref',
            row.lineNo,
            `SUPERSEDED row "${id}" must reference an existing replacement registry ID.`,
          );
        }
      }
    }
  }

  // --- Rule 14: phase-plan back-references resolve ---
  const planAbs = join(rootDir, PHASE_PLAN_PATH);
  if (existsSync(planAbs)) {
    const planText = readFileSync(planAbs, 'utf8');
    const referenced = new Set();
    for (const m of planText.matchAll(/FIG-[A-Z0-9][A-Z0-9-]*/g)) referenced.add(m[0]);
    for (const ref of referenced) {
      if (!allRegistryIds.has(ref) && !Object.values(CANONICAL_FILE_KEYS).includes(ref)) {
        add(
          'phase-ref',
          0,
          `APP1 phase plan references registry ID "${ref}" that is absent from the index.`,
        );
      }
    }
  }

  // --- Rule 15: the named APP2-A03 Product Form authority stays promoted ---
  violations.push(...checkA03Approval(rowsById, content));

  return {
    violations,
    stats: { registryIds: seenIds.size, nodeRows: nodeRowCount, tables: nodeTables.length },
  };
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const { violations, stats } = checkFigmaDesignIndex(rootDir);

  if (violations.length > 0) {
    console.error('Figma Design Index check FAILED:');
    for (const v of violations) {
      console.error(`  ${INDEX_PATH}:${v.line}  [${v.rule}]  ${v.message}`);
    }
    console.error(`\n${violations.length} violation(s). See ${INDEX_PATH} §2 usage rules.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Figma Design Index check passed (${stats.registryIds} registry IDs, ${stats.nodeRows} node rows, ` +
      `${stats.tables} registry table(s); canonical files + statuses + deep links + composites verified).`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  main();
}
