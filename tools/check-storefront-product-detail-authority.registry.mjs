/**
 * What the Figma registry must say about Product Detail's design authority
 * (`APP2-S02-G01`, amended by `APP12-E01` §3.9).
 *
 * Split out of the gate itself because it answers a different question. The gate
 * is about the *ruling* — where the page lives, what it may show, what stays
 * deferred. This module is about the *registry*: which nodes carry current
 * implementation authority for that page, and which are recorded history that
 * must never be promoted back.
 *
 * Takes the ruling's identifiers as arguments rather than importing them, so the
 * gate stays the single place that states them and the two files do not form a
 * cycle.
 */

/** The reconciled roots that carry S02 implementation authority. */
export const RECONCILED_ROOTS = Object.freeze([
  '529:2224',
  '529:2225',
  '529:2431',
  '529:2575',
  '532:3',
  '532:105',
  '533:3',
  '533:26',
  '537:3',
  '537:38',
]);

/**
 * Resolves a reconciled root that is no longer itself implementable
 * (`APP12-E01` §3.9, `FU-APP12-G03-01`).
 *
 * The gate used to demand `APPROVED_FOR_IMPLEMENTATION` on every one of the ten
 * roots, full stop. That was right until `APP12-M01.D1` moved Product Detail
 * lightbox authority to a new package: the two lightbox roots became
 * `SUPERSEDED` — correctly, with a successor named — and the gate started
 * failing on a registry that was telling the truth. It had been red ever since,
 * which is worse than useless: a permanently failing gate is one nobody reads.
 *
 * The line it holds is unchanged. A superseded root is accepted **only** when the
 * registry says where authority went and the successor is itself approved for
 * implementation, for the same route. A root that is merely unapproved, or
 * superseded by nothing, or superseded by something that is not approved, still
 * fails — so this follows authority rather than forgiving its absence.
 */
function checkSupersession({ text, node, row, route, designIndex, fail }) {
  const where = `${designIndex}: reconciled root ${node}`;
  if (!row.includes('| SUPERSEDED |')) {
    fail(`${where} is not APPROVED_FOR_IMPLEMENTATION`);
    return;
  }
  // The registry records supersession as `→ <SUCCESSOR_ID>` in its own column.
  const successorId = /\|\s*→\s*(FIG-[A-Z0-9-]+)\s*\|/.exec(row)?.[1];
  if (successorId === undefined) {
    fail(`${where} is SUPERSEDED but names no successor row`);
    return;
  }
  const successor = text
    .split('\n')
    .find((line) => line.startsWith(`| ${successorId} |`) && !line.includes('| SUPERSEDED |'));
  if (successor === undefined) {
    fail(`${where} is SUPERSEDED by ${successorId}, which the registry does not record as current`);
    return;
  }
  if (!successor.includes('APPROVED_FOR_IMPLEMENTATION')) {
    fail(`${where} is SUPERSEDED by ${successorId}, which is not APPROVED_FOR_IMPLEMENTATION`);
    return;
  }
  // Authority may move between packages; it may not move to another screen.
  if (!successor.includes(`| ${route} |`)) {
    fail(`${where} is SUPERSEDED by ${successorId}, which is not a ${route} row`);
  }
}

/**
 * @param {{ text: string, approvalId: string, route: string, ui03Roots: readonly string[],
 *           designIndex: string, fail: (message: string) => void }} params
 */
export function checkRegistry({ text, approvalId, route, ui03Roots, designIndex, fail }) {
  const approvals = text.split('\n').filter((line) => line.includes(approvalId));
  const rows = approvals.filter((line) => line.startsWith('| FIG-'));
  if (rows.length !== RECONCILED_ROOTS.length) {
    fail(
      `${designIndex}: ${rows.length} row(s) carry ${approvalId}, ` +
        `expected ${RECONCILED_ROOTS.length}`,
    );
  }
  for (const node of RECONCILED_ROOTS) {
    const row = rows.find((line) => line.includes(`| ${node} |`));
    if (row === undefined) {
      fail(`${designIndex}: reconciled root ${node} has no approved registry row`);
    } else if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      checkSupersession({ text, node, row, route, designIndex, fail });
    }
  }
  for (const node of ui03Roots) {
    const row = text
      .split('\n')
      .find((line) => line.startsWith('| FIG-UI03-') && line.includes(`| ${node} |`));
    if (row === undefined) {
      fail(`${designIndex}: UI03 draft root ${node} is no longer recorded`);
      continue;
    }
    if (!row.includes('HISTORICAL_DRAFT_SOURCE')) {
      fail(`${designIndex}: UI03 root ${node} is not HISTORICAL_DRAFT_SOURCE`);
    }
    if (row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${designIndex}: UI03 root ${node} is marked implementable`);
    }
  }
}
