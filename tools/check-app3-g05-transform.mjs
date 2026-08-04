#!/usr/bin/env node
/**
 * `APP3-G05` — the coordinate, transform and group half of `IMP-D045`.
 *
 * These are the six facts the first `APP3-P02` attempt stopped for, and they
 * share one property that makes a gate worth having: **a v1 document cannot
 * record which of them was used.** It stores `x`, `y`, `rotationDeg`, `scaleX`,
 * `scaleY` and no pivot marker, so flipping the pivot from box centre to corner
 * silently relocates every stored design while the integrity hash — taken over
 * the bytes, not the interpretation — stays valid. The one mechanism that would
 * normally catch a semantic change is structurally blind to this one.
 *
 * So each fact is asserted as an exact string rather than a "contains", and the
 * forbidden alternatives are asserted too: it is not enough that the ruling says
 * *centre*, the ruling must still say the corner and the renderer default are
 * out.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */

/**
 * Every coordinate/transform/group fact, keyed exactly as §6.11.1 writes it.
 *
 * `x` stands in for the multiplication sign throughout, because a Markdown
 * table cell and a JavaScript string agree on ASCII and disagree about nothing.
 */
export const TRANSFORM_FACTS = Object.freeze({
  // PO-01 — coordinate system
  'Coordinate origin': 'TOP_LEFT',
  'Positive x direction': 'RIGHT',
  'Positive y direction': 'DOWN',
  'Angle unit': 'DEGREES',

  // PO-02 — what the persisted fields mean
  'Persisted x y meaning': 'UNTRANSFORMED_LOCAL_BOX_TOP_LEFT_IN_PARENT_FRAME',
  'Persisted width height meaning': 'POSITIVE_UNSCALED_LOCAL_BOX',
  'Local drawable origin': '0,0',
  'Root element parent frame': 'DOCUMENT_SPACE',
  'Child element parent frame': 'DIRECT_GROUP_LOCAL_SPACE',

  // PO-03 — rotation
  'Positive rotation direction': 'CLOCKWISE',
  'Rotation pivot': 'UNTRANSFORMED_LOCAL_BOX_CENTRE',
  'Rotation pivot local coordinates': 'width / 2, height / 2',
  'Forbidden rotation pivots':
    'PERSISTED_CORNER DOCUMENT_ORIGIN GROUP_ORIGIN TRANSFORMED_AABB_CENTRE RENDERER_DEFAULT',

  // PO-04 — scale
  'Scale pivot': 'UNTRANSFORMED_LOCAL_BOX_CENTRE',
  'Scale before rotation': 'YES',
  'Negative scale meaning': 'REFLECTION_AROUND_CENTRE_PIVOT',
  'Persisted transform mutation by P02': 'NEVER',

  // PO-05 — the matrix contract
  'Matrix convention': 'COLUMN_VECTOR',
  'Matrix application': "p' = M x p",
  'Matrix field mapping': "x' = a*x + c*y + e ; y' = b*x + d*y + f",
  'Local matrix order':
    'T(x + width/2, y + height/2) x R(rotationDeg) x S(scaleX, scaleY) x T(-width/2, -height/2)',
  'Clockwise rotation matrix': 'a = cos ; b = sin ; c = -sin ; d = cos ; e = 0 ; f = 0',
  'Row vector semantics': 'FORBIDDEN',

  // PO-06 / PO-07 — the group frame
  'Effective transform composition': 'PARENT_TIMES_CHILD',
  'Group local frame origin': 'GROUP_UNTRANSFORMED_LOCAL_BOX_TOP_LEFT',
  'Group transform inheritance': 'FULL_UNIFORM',
  'Forbidden group inheritance':
    'CHILD_TIMES_PARENT DOCUMENT_SPACE_CHILDREN PARTIAL SCALE_ONLY RENDERER_OWNED',
  'Group persisted box role': 'LOCAL_FRAME_AND_PIVOT_ONLY',
  'Group persisted box as bounds': 'NEVER',
  'Group pivot from descendant bounds': 'FORBIDDEN',
  'Group child rebasing by P02': 'FORBIDDEN',
  'Group visible geometry': 'NONE',
});

/**
 * Prose claims the ruling section must still make.
 *
 * A fact table can stay correct while the paragraph explaining it drifts, and
 * the paragraph is what a human reads before implementing. Both are checked.
 *
 * Matched against **whitespace-collapsed** text: a claim spanning a Markdown
 * line wrap is the same claim, and a per-line search would report it missing the
 * first time someone reflows the file (the defect `APP3-G01` hit).
 */
export const TRANSFORM_CLAIMS = Object.freeze([
  ['positive rotationDeg is clockwise', 'Positive `rotationDeg` is **clockwise**'],
  ['the pivot is the untransformed local box centre', 'centre of the **untransformed local box**'],
  ['the root-element pivot in document space', '(x + width/2, y + height/2)'],
  ['scale is applied before rotation', 'scale is applied **before** rotation'],
  ['column-vector semantics', 'Column-vector affine semantics'],
  ['the explicit local matrix formula', 'Mlocal = T(x + width/2, y + height/2)'],
  ['parent-outermost composition', 'Meffective(child) = Meffective(parent group) x Mlocal(child)'],
  [
    'a group defines a real local coordinate frame',
    'A group defines a **real local coordinate frame**',
  ],
  [
    'the group box is never replaced by descendant bounds',
    'never replaced dynamically by descendant bounds',
  ],
  ['P02 never rebases children', 'never rebase children automatically'],
]);

export const collapse = (text) => text.replace(/\s+/g, ' ');

/**
 * Checks the transform half against the bounded §6.11.1 table and the §6.11.2
 * prose. `rows` is the parsed table; `rulings` is the prose body.
 */
export function checkTransformAuthority(rows, rulings, fail) {
  for (const [key, expected] of Object.entries(TRANSFORM_FACTS)) {
    const actual = rows.get(key);
    if (actual === undefined) {
      fail(`§6.11.1 records no "${key}"`);
    } else if (actual !== expected) {
      fail(`§6.11.1 "${key}" is "${actual}", expected "${expected}"`);
    }
  }
  const prose = collapse(rulings);
  for (const [label, claim] of TRANSFORM_CLAIMS) {
    if (!prose.includes(collapse(claim))) fail(`§6.11.2 no longer states ${label}`);
  }
}
