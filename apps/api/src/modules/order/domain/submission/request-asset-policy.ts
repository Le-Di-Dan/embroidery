/**
 * The APP5 asset-role matrix (`APP5-G01` §6, `G01-D10`/`G01-D13`/`G01-D14`).
 *
 * `REQUEST_ASSET_ROLES` in the schema is `COP_IMAGE | REFERENCE | ATTACHMENT`.
 * APP5 exposes the first two and **refuses the third at the contract boundary**
 * (`G01-D14`): the journey has exactly two customer-supplied meanings — *this is
 * the garment* and *this is what I want it to look like* — and a third,
 * undifferentiated bucket would be a role whose triage meaning no screen can
 * explain. The role stays in the schema for APP6+ to adopt.
 *
 * The caps are APP5 intake bounds. No existing authority sets a count limit —
 * `IMP-D044` bounds bytes and pixels, not cardinality — so `G01-D13` sets ten
 * per role: enough to photograph a garment from every side, small enough that
 * the Admin detail screen and the submission transaction stay bounded.
 */

/** `G01-D14`. The closed set APP5 accepts; `ATTACHMENT` is deliberately absent. */
export const APP5_REQUEST_ASSET_ROLES = ['COP_IMAGE', 'REFERENCE'] as const;

export type App5RequestAssetRole = (typeof APP5_REQUEST_ASSET_ROLES)[number];

/** `G01-D13`. Per role, per request. */
export const MAX_ASSETS_PER_ROLE = 10;

/** `G01` §6 — the kind and classification a bindable customer upload carries. */
export const BINDABLE_ASSET_KIND = 'CUSTOMER_UPLOAD';
export const BINDABLE_ASSET_CLASSIFICATION = 'CUSTOMER_PRIVATE';

/** `G01` §6 — inspection must have completed favourably before a bind. */
export const BINDABLE_ASSET_STATE = 'ACCEPTED';

/**
 * Whether a role may carry assets on this branch.
 *
 * `COP_IMAGE` describes a customer-owned garment, so it is meaningless on a
 * catalog request; `REFERENCE` is *"what I want it to look like"* and belongs to
 * both. The COP branch's **≥1 `COP_IMAGE`** requirement (`G01-D10`) is a
 * separate rule, checked by the binder: without a photograph nothing in the
 * record describes the physical object an Admin is asked to triage.
 */
export function isRoleAllowedOnBranch(
  role: App5RequestAssetRole,
  branch: 'CATALOG' | 'COP',
): boolean {
  return role === 'REFERENCE' || branch === 'COP';
}
