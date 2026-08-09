#!/usr/bin/env node
/**
 * The two `APP3-A04` authorities that are worth stating once: which design rows
 * this checkpoint was allowed to approve, and what the readiness panel must be.
 *
 * Split from `check-app3-a04.mjs` by responsibility — that module rules on the
 * screen's behaviour, this one on the facts the screen is measured against — and
 * because the checker would otherwise sit past its size budget.
 *
 * Read-only, cross-platform pure Node.
 */

/** Exactly the five rows in Figma section `596:10`, and no sixth. */
export const A04_DESIGN_ROWS = Object.freeze([
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY',
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-GUARDFAIL',
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-PUBLISHCONFIRM',
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-ARCHIVE',
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED',
]);

/** The approval-evidence token this checkpoint's operator review writes. */
export const A04_APPROVAL_EVIDENCE = 'APP3-A04 §0 operator review';

/** The four LC-24 operations that cross the curated boundary together. */
export const A04_LIFECYCLE_OPERATIONS = Object.freeze([
  'adminDesignTemplatePublish',
  'adminDesignTemplateUnpublish',
  'adminDesignTemplateArchive',
  'adminDesignTemplateRestore',
]);

/**
 * The seven `GRD-T01` conditions, in the order `IMP-D042` PO-07 composes them.
 *
 * The panel must render all seven **always**. A partial list is the dangerous
 * simplification: an operator who sees five rows cannot know the server checks
 * seven, and the two that were hidden are the likeliest to refuse them.
 */
export const READINESS_CONDITIONS = Object.freeze([
  'IMMUTABLE_VERSION',
  'SCOPE_COMPLETE',
  'DOCUMENT_VALID',
  'SCOPE_ACTIVE',
  'PLACEMENT_MATCHES',
  'WITHIN_AREA',
  'MEDIA_ELIGIBLE',
]);

/**
 * Exactly those five rows are approved, under this checkpoint's own evidence.
 *
 * Asserted as "what did A04 approve", not "what is approved in the registry":
 * `FIG-STUDIO-EDITING-TABLET-1024` was already `APPROVED_FOR_IMPLEMENTATION`
 * under `APP3-A01 §0` as a responsive reference, so a blanket "no Studio row is
 * approved" would fail on a row this checkpoint never touched.
 */
export function checkDesignApproval(rootDir, fail, read) {
  const registry = read(rootDir, 'registry') ?? '';
  const lines = registry.split('\n');

  for (const id of A04_DESIGN_ROWS) {
    const row = lines.find((line) => line.startsWith(`| ${id} `));
    if (row === undefined) {
      fail(`the Figma registry: no row ${id}`);
      continue;
    }
    if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`the Figma registry: ${id} is not APPROVED_FOR_IMPLEMENTATION`);
    }
    if (!row.includes(A04_APPROVAL_EVIDENCE)) {
      fail(`the Figma registry: ${id} carries no A04 approval evidence`);
    }
  }

  const approvedHere = lines
    .filter((line) => line.includes(A04_APPROVAL_EVIDENCE))
    .map((line) => line.split('|')[1]?.trim());

  if (approvedHere.length !== A04_DESIGN_ROWS.length) {
    fail(
      `the Figma registry: ${approvedHere.length} rows approved under A04, expected ${A04_DESIGN_ROWS.length}`,
    );
  }
  for (const id of approvedHere) {
    if (!A04_DESIGN_ROWS.includes(id ?? '')) {
      fail(`the Figma registry: ${String(id)} was approved under A04 but is not an A04 row`);
    }
  }
}

/**
 * All seven conditions exist, are rendered, and the unprovable third state is
 * real — never a pass, and never a block.
 */
export function checkReadinessConcepts(rootDir, fail, code, files) {
  const model = code(rootDir, 'readinessModel');
  const panel = code(rootDir, 'readinessPanel');
  const actions = code(rootDir, 'actionPanel');

  for (const condition of READINESS_CONDITIONS) {
    if (!model.includes(condition)) {
      fail(`${files.readinessModel}: does not represent GRD-T01 condition ${condition}`);
    }
  }
  if (!/CHECKED_ON_PUBLISH/.test(model)) {
    fail(`${files.readinessModel}: has no state for a condition the client cannot prove`);
  }
  // The panel renders every row it is given — no filtering to the "interesting"
  // ones, which is how a hidden condition becomes an unexplained refusal.
  if (!/report\.rows\.map\(/.test(panel)) {
    fail(`${files.readinessPanel}: does not render every condition`);
  }
  if (/\.filter\(/.test(panel)) {
    fail(`${files.readinessPanel}: filters the conditions it renders`);
  }
  // The mark is decorative; the state is also in text.
  if (!/aria-hidden="true"/.test(panel)) {
    fail(`${files.readinessPanel}: the state glyph is not marked decorative`);
  }

  // Blocking is limited to the two locally authoritative facts.
  const blocked = /const blocked = rows\.some\(([\s\S]*?)\);/.exec(model);
  if (blocked === null) {
    fail(`${files.readinessModel}: the blocking rule is not identifiable`);
  } else {
    if (!/row\.state === 'NOT_READY'/.test(blocked[1])) {
      fail(`${files.readinessModel}: blocks on something other than a proven failure`);
    }
    for (const condition of READINESS_CONDITIONS) {
      const authoritative = condition === 'IMMUTABLE_VERSION' || condition === 'SCOPE_COMPLETE';
      if (blocked[1].includes(condition) !== authoritative) {
        fail(
          `${files.readinessModel}: ${condition} ${authoritative ? 'no longer blocks' : 'blocks'} publish`,
        );
      }
    }
  }
  // Publish is disabled by the model's verdict, never by a count of unknowns.
  if (!/disabled=\{blocked \|\| busy !== null\}/.test(actions)) {
    fail(`${files.actionPanel}: publish is not disabled by the authoritative blocking rule alone`);
  }
}
