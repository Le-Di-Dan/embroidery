/**
 * Which paths each delivered APP3 checkpoint owns.
 *
 * Split out of `app3-accepted-surface.mjs` by responsibility, and because that
 * file crossed the 400-line source limit when `APP3-B02A` added its authority.
 * The two answer different questions: that module says how large the accepted
 * surface **is**, this one says which concrete paths are legitimately in it and
 * which checkpoint each belongs to.
 *
 * Every gate keeps consulting `app3-accepted-surface.mjs`, which re-exports all
 * of this — so the split moved code without moving any import.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';
/**
 * The Admin Design Template paths `APP3-B03` publishes.
 *
 * Six earlier gates each carry an allow-list of "APP3 paths that legitimately
 * exist" and refuse everything else, with a message saying no backend checkpoint
 * has run. That proxy was true right up to `APP3-B03`, which is precisely the
 * failure mode `APP3-B06B` recorded: a gate that bans a shape is a proxy the
 * next checkpoint invalidates. Each gate keeps its real assertion — the counts,
 * the frozen digests, its own subject — and consults this one list instead of
 * carrying a seventh copy of the literal.
 */
const ADMIN_TEMPLATE_PATHS = Object.freeze([
  '/api/admin/design-templates',
  '/api/admin/design-templates/{templateId}',
]);

/** The one path `APP3-B03A` adds on top of them. */
const ADMIN_TEMPLATE_SAVE_PATH = '/api/admin/design-templates/{templateId}/document';

/** The one `APP3-B03B` adds: the one-time initial scope assignment. */
const ADMIN_TEMPLATE_SCOPE_PATH = '/api/admin/design-templates/{templateId}/scope';

/** The three `APP3-B04` adds. Restore is `APP3-B04A`'s and is listed separately. */
const ADMIN_TEMPLATE_LIFECYCLE_PATHS = Object.freeze([
  '/api/admin/design-templates/{templateId}/publish',
  '/api/admin/design-templates/{templateId}/unpublish',
  '/api/admin/design-templates/{templateId}/archive',
]);

/** The one `APP3-B04A` adds: `TR-LC24-06`, the only way out of `ARCHIVED`. */
const ADMIN_TEMPLATE_RESTORE_PATH = '/api/admin/design-templates/{templateId}/restore';

/** True once `APP3-B03` has published the Admin Design Template surface. */
export function isB03Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B03 = COMPLETE/.test(phase);
}

/** True once `APP3-B03A` has published the draft document save. */
export function isB03ADelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B03A = COMPLETE/.test(phase);
}

/** True once `APP3-B03B` has published the initial scope assignment. */
export function isB03BDelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B03B = COMPLETE/.test(phase);
}

/** True once `APP3-B04` has published the LC-24 lifecycle transitions. */
export function isB04Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B04 = COMPLETE/.test(phase);
}

/**
 * True once `APP3-A04` has delivered the Admin lifecycle screen.
 *
 * Four predecessor gates rule on facts A04 legitimately changes: the five
 * lifecycle design rows move from `REVIEW_REQUIRED` to approved, the four
 * lifecycle operations cross the curated client, and a third Design Template
 * route appears. Each of those was an absence that proved "A04 has not run", and
 * each stops describing the world the moment it does — so they consult this
 * rather than carrying a copy of the ban.
 */
export function isA04Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-A04 = COMPLETE/.test(phase);
}

/** True once `APP3-B04A` has published the restore transition. */
export function isB04ADelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B04A = COMPLETE/.test(phase);
}

export function acceptedAdminTemplatePaths(rootDir) {
  if (!isB03Delivered(rootDir)) return [];
  const paths = [...ADMIN_TEMPLATE_PATHS];
  if (isB03ADelivered(rootDir)) paths.push(ADMIN_TEMPLATE_SAVE_PATH);
  if (isB03BDelivered(rootDir)) paths.push(ADMIN_TEMPLATE_SCOPE_PATH);
  if (isB04Delivered(rootDir)) paths.push(...ADMIN_TEMPLATE_LIFECYCLE_PATHS);
  if (isB04ADelivered(rootDir)) paths.push(ADMIN_TEMPLATE_RESTORE_PATH);
  return paths;
}

/** The three lifecycle paths, for gates that must assert their absence before B04. */
export function lifecycleAdminTemplatePaths() {
  return [...ADMIN_TEMPLATE_LIFECYCLE_PATHS];
}

/** The restore path itself, for gates that rule on it in either direction. */
export function restoreAdminTemplatePath() {
  return ADMIN_TEMPLATE_RESTORE_PATH;
}

/** The status lines `APP3-B04A` may legitimately be recorded under. */
export const B04A_STATUS_LINES = Object.freeze([
  'APP3-B04A = READY — NOT STARTED',
  'APP3-B04A = BLOCKED_BY_APP3-B04 — NOT STARTED',
  'APP3-B04A = COMPLETE — REVIEW_DELIVERED',
  'APP3-B04A = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * The two public Design Template paths `APP3-B05` publishes.
 *
 * Kept apart from the Admin list rather than folded into it. Five gates hold an
 * allow-list of "APP3 paths that legitimately exist" and refuse everything else,
 * and every one of them matches on the shape `design-templates?` — so a public
 * Template route trips all five without being any of theirs. They consult this
 * list; they do not carry a copy of it. But three *other* gates count the Admin
 * Template operations, and a public path folded into that count would inflate a
 * number that is supposed to describe the Admin surface alone.
 */
const PUBLIC_TEMPLATE_PATHS = Object.freeze([
  '/api/public/design-templates',
  '/api/public/design-templates/{slug}',
]);

/** True once `APP3-B05` has published the public Design Template reads. */
export function isB05Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B05 = COMPLETE/.test(phase);
}

/** The public Template paths the accepted world may contain — none before B05. */
export function acceptedPublicTemplatePaths(rootDir) {
  return isB05Delivered(rootDir) ? [...PUBLIC_TEMPLATE_PATHS] : [];
}

/** Both public paths, for gates that must assert their absence before B05. */
export function publicTemplatePaths() {
  return [...PUBLIC_TEMPLATE_PATHS];
}

/**
 * The one path `APP3-B05A` adds: contextual published Template asset delivery.
 *
 * Held apart from `PUBLIC_TEMPLATE_PATHS` deliberately. Three gates count the
 * *B05-owned* public Template operations, and folding a binary delivery route
 * into that list would inflate a number meant to describe two JSON reads —
 * `APP3-B05` owns `publicDesignTemplate_list` and `publicDesignTemplate_detail`
 * and nothing else. The route is nonetheless a `design-templates` address, so
 * every gate holding an allow-list of legitimate APP3 paths must learn about it
 * from here rather than by growing a copy.
 */
const PUBLIC_TEMPLATE_ASSET_PATH =
  '/api/public/design-templates/{slug}/versions/{version}/assets/{assetId}';

/** True once `APP3-B05A` has published the Template asset delivery route. */
export function isB05ADelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B05A = COMPLETE/.test(phase);
}

/** The delivery path the accepted world may contain — none before B05A. */
export function acceptedPublicTemplateAssetPaths(rootDir) {
  return isB05ADelivered(rootDir) ? [PUBLIC_TEMPLATE_ASSET_PATH] : [];
}

/** The path itself, for gates that rule on it in either direction. */
export function publicTemplateAssetPath() {
  return PUBLIC_TEMPLATE_ASSET_PATH;
}

/**
 * True once `APP3-S01` has delivered the Storefront Studio bootstrap.
 *
 * `APP3-B05A` asserts that `APP3-S01` is *not* recorded complete, as its proof
 * that a backend checkpoint did not quietly implement its own consumer. That
 * absence was a true statement about the world right up to the moment S01
 * legitimately shipped — the same shape as every other proxy this module
 * exists to retire. B05A keeps the assertion and consults this instead, so the
 * ban still bites in the world it was written for.
 *
 * S01 publishes no HTTP path, so there is deliberately no accepted-path list
 * beside this: the frontend changes no surface, and a gate that expected one
 * would be asserting a change S01 must never make.
 */
export function isS01Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S01 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S01` may legitimately be recorded under. */
export const S01_STATUS_LINES = Object.freeze([
  'APP3-S01 = BLOCKED_BY_APP3-B05A',
  'APP3-S01 = READY — NOT STARTED',
  'APP3-S01 = COMPLETE — REVIEW_DELIVERED',
  // Human review returned S01 with one ordinary correction (`APP3-S01-C1`).
  // The checkpoint is still delivered — the route, the operations and the bans
  // all hold — so the world-aware gates continue to read it as delivered.
  'APP3-S01 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW',
  'APP3-S01 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * True once `APP3-S02` has delivered the production Studio stage.
 *
 * `APP3-S01`'s gate bans a renderer, an `<svg>`, a Zustand store and the Side
 * background operation anywhere in the Studio feature. Every one of those was a
 * true statement about the world until S02 legitimately shipped exactly one of
 * each. The bans are kept and made world-aware against this rather than
 * deleted: before S02 they still bite, after it they become "exactly one".
 */
export function isS02Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S02 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S02` may legitimately be recorded under. */
export const S02_STATUS_LINES = Object.freeze([
  'APP3-S02 = BLOCKED_BY_APP3-S01_CORRECTION_REVIEW',
  'APP3-S02 = READY — NOT STARTED',
  'APP3-S02 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S02 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * True once `APP3-S07` has delivered the Studio viewport.
 *
 * Both earlier Studio gates ban something S07 legitimately introduces: `APP3-S01`
 * bans the word "viewport" anywhere in the feature, and `APP3-S02` bans
 * `onPointerDown`, `onPointerMove` and every DOM measurement. Each was a true
 * statement about the world until this checkpoint shipped exactly one bounded
 * use of each. They keep the assertion and consult this, so the ban still bites
 * before S07 and becomes "in exactly these files" after it.
 */
export function isS07Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S07 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S07` may legitimately be recorded under. */
export const S07_STATUS_LINES = Object.freeze([
  'APP3-S07 = READY — NOT STARTED',
  'APP3-S07 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S07 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * The Studio files `APP3-S07` adds, relative to the design-studio feature.
 *
 * One list, imported by all three Studio gates rather than copied into each.
 * It exists because the world-aware evolution has to name the **new** files: a
 * rule scoped to the files S01 or S02 owned would let anything added tomorrow
 * escape it, which is precisely how a second renderer or a stray pointer handler
 * would arrive. Everything not on this list — including a file that does not
 * exist yet — inherits the strict predecessor rules by default.
 */
export const S07_FILES = Object.freeze([
  'components/studio-stage-controls.tsx',
  'components/studio-stage-viewport.tsx',
  'model/studio-viewport.ts',
  'model/studio-viewport-copy.ts',
  'store/studio-viewport.store.ts',
]);

/**
 * True once `APP3-S03` has delivered the Studio transform controls.
 *
 * Three earlier gates ban something S03 legitimately introduces: `APP3-S01`
 * bans a Zustand store outside the ones it knows about, and `APP3-S02` bans
 * every pointer gesture, every layout measurement and — as a proxy for "build
 * no second geometry engine" — `Math.PI`, `Math.atan2` and `composeMatrices(`.
 * The last of those is `APP3-P02`'s own export, so the proxy was always going
 * to expire the moment a checkpoint had to *use* the engine to compose a frame.
 * Each ban is kept and consults this, so it still bites before S03.
 */
export function isS03Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S03 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S03` may legitimately be recorded under. */
export const S03_STATUS_LINES = Object.freeze([
  'APP3-S03 = READY — NOT STARTED',
  'APP3-S03 = COMPLETE — REVIEW_DELIVERED',
  // `APP3-S03-C1` — human review accepted every property but one and returned a
  // single performance correction, so the checkpoint is delivered again rather
  // than accepted or rewound.
  'APP3-S03 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW',
  'APP3-S03 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * The Studio files `APP3-S03` adds, relative to the design-studio feature.
 *
 * Named for the same reason `S07_FILES` is: the world-aware evolution lists the
 * **new** files, so anything added later inherits the strict predecessor rules
 * by default rather than escaping them.
 */
export const S03_FILES = Object.freeze([
  'components/studio-transform-overlay.tsx',
  'hooks/use-studio-transform.ts',
  'model/studio-session-key.ts',
  'model/studio-stage-mapping.ts',
  'model/studio-transform.ts',
  'model/studio-transform-authority.ts',
  'model/studio-transform-copy.ts',
  'model/studio-transform-handles.ts',
  'store/studio-document.store.ts',
]);

/**
 * True once `APP3-S05` has delivered the Studio text capability.
 *
 * Four earlier gates ban something S05 legitimately introduces. `APP3-S01` bans
 * every use of the `APP3-P01` authority outside the files it knows about, and
 * `APP3-S01`, `S02`, `S03` and `S07` each assert that the section-09 text row
 * still belongs to a checkpoint that has not opened — which stops being true the
 * moment this one does. Each ban is kept and consults this, so all four still
 * bite before S05.
 */
export function isS05Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S05 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S05` may legitimately be recorded under. */
export const S05_STATUS_LINES = Object.freeze([
  'APP3-S05 = READY — NOT STARTED',
  'APP3-S05 = COMPLETE — REVIEW_DELIVERED',
  // The two states human review introduced: a correction was asked for, and a
  // correction was delivered against it.
  'APP3-S05 = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED',
  'APP3-S05 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW',
  'APP3-S05 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * True once `APP3-S05-C1` has delivered the responsive and font-variant
 * correction.
 *
 * Separate from `isS05Delivered` because the two answer different questions.
 * `S05` shipping is what makes the text *capability* real, and four earlier
 * gates consult that. `S05-C1` shipping is what makes the tablet drawer, the
 * mobile boundary and the variant-aware readiness real — and those rules must
 * not run against a tree that predates them, or the gate would fail the very
 * world it was written to accept.
 */
export function isS05C1Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-S05-C1 = COMPLETE/.test(phase);
}

/** The status lines `APP3-S05-C1` may legitimately be recorded under. */
export const S05_C1_STATUS_LINES = Object.freeze([
  'APP3-S05-C1 = READY — NOT STARTED',
  'APP3-S05-C1 = COMPLETE — REVIEW_DELIVERED',
  'APP3-S05-C1 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * The Studio files `APP3-S05` adds, relative to the design-studio feature.
 *
 * Named for the same reason `S07_FILES` and `S03_FILES` are: the world-aware
 * evolution lists the **new** files, so anything added later inherits the strict
 * predecessor rules by default rather than escaping them.
 */
export const S05_FILES = Object.freeze([
  'components/studio-text-controls.tsx',
  'components/studio-text-drawer.tsx',
  'components/studio-text-inspector.tsx',
  'components/studio-text-panel.tsx',
  'hooks/use-controlled-font.ts',
  'hooks/use-studio-text.ts',
  'hooks/use-studio-viewport-tier.ts',
  'model/studio-font-variant.ts',
  'model/studio-responsive.ts',
  'model/studio-text-authority.ts',
  'model/studio-text-copy.ts',
  'model/studio-text-fields.ts',
]);

/** The three section-09 design rows `APP3-S05` consumes, and their nodes. */
export const S05_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-TEXT-DESKTOP-EDITING': '608:176',
  'FIG-STUDIO-TEXT-DESKTOP-FONTPICKER': '608:231',
  'FIG-STUDIO-TEXT-DESKTOP-VALIDATION': '608:286',
});

/** The status lines `APP3-B05A` may legitimately be recorded under. */
export const B05A_STATUS_LINES = Object.freeze([
  'APP3-B05A = DEFINED — BLOCKED_BY_APP3-B05 — NOT STARTED',
  'APP3-B05A = READY — NOT STARTED',
  'APP3-B05A = COMPLETE — REVIEW_DELIVERED',
  'APP3-B05A = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * The one Admin Side-background delivery path (`APP3-B02A`).
 *
 * Held here rather than in each gate for the reason the whole module exists: it
 * is an Admin `products/{id}/sides/...` route, so every predecessor gate that
 * enumerates the accepted Admin product surface would otherwise have to learn
 * about it individually — and each of those edits is a chance to widen a rule
 * that was meant to stay narrow.
 */
const ADMIN_SIDE_BACKGROUND_PATH = '/api/admin/products/{productId}/sides/{sideId}/background';

/** True once `APP3-B02A` has published the Admin Side-background delivery. */
export function isB02ADelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B02A = COMPLETE/.test(phase);
}

/** The Admin background path the accepted world may contain — none before B02A. */
export function acceptedAdminSideBackgroundPaths(rootDir) {
  return isB02ADelivered(rootDir) ? [ADMIN_SIDE_BACKGROUND_PATH] : [];
}

/** The path itself, for gates that must assert its absence before B02A. */
export function adminSideBackgroundPath() {
  return ADMIN_SIDE_BACKGROUND_PATH;
}

/** The status lines `APP3-B02A` may legitimately be recorded under. */
export const B02A_STATUS_LINES = Object.freeze([
  'APP3-B02A = READY — NOT STARTED',
  'APP3-B02A = COMPLETE — REVIEW_DELIVERED',
  'APP3-B02A = COMPLETE — REVIEW_ACCEPTED',
]);

/** The status lines `APP3-B05` may legitimately be recorded under. */
export const B05_STATUS_LINES = Object.freeze([
  'APP3-B05 = READY — NOT STARTED',
  'APP3-B05 = COMPLETE — REVIEW_DELIVERED',
  'APP3-B05 = COMPLETE — REVIEW_ACCEPTED',
]);

/**
 * How many operations each accepted path carries. Only the collection carries
 * two — list and create; every other Admin Template path carries one.
 */
const ADMIN_TEMPLATE_PATH_OPERATIONS = Object.freeze({ '/api/admin/design-templates': 2 });

/**
 * The number of Admin Design Template operations the accepted world publishes.
 *
 * Derived from the same accepted-path list, so a gate never carries its own
 * literal: every checkpoint that adds a path moves this count for all of them at
 * once, and a count that no accepted checkpoint explains still fails.
 */
export function acceptedAdminTemplateOperationCount(rootDir) {
  return acceptedAdminTemplatePaths(rootDir).reduce(
    (total, path) => total + (ADMIN_TEMPLATE_PATH_OPERATIONS[path] ?? 1),
    0,
  );
}

/**
 * The status lines `APP3-B03` may legitimately be recorded under.
 *
 * Two consistent worlds and no third, for the same reason `APP3-B08` has two:
 * three gates assert that the platform Zod/OpenAPI follow-up and B03's readiness
 * agree, and a single pinned token would fail the moment B03 shipped. Asserted
 * here rather than read back out of the phase document, which would accept
 * whatever was written.
 */
export const B03_STATUS_LINES = Object.freeze([
  'APP3-B03 = READY — NOT STARTED',
  'APP3-B03 = COMPLETE — REVIEW_DELIVERED',
  'APP3-B03 = COMPLETE — REVIEW_ACCEPTED',
]);

/** The status lines `APP3-B04` may legitimately be recorded under. */
export const B04_STATUS_LINES = Object.freeze([
  'APP3-B04 = READY — NOT STARTED',
  'APP3-B04 = COMPLETE — REVIEW_DELIVERED',
  'APP3-B04 = COMPLETE — REVIEW_ACCEPTED',
]);

/** The status lines `APP3-B03A` may legitimately be recorded under. */
export const B03A_STATUS_LINES = Object.freeze([
  'APP3-B03A = BLOCKED_BY_APP3-B03 — NOT STARTED',
  'APP3-B03A = READY — NOT STARTED',
  'APP3-B03A = COMPLETE — REVIEW_DELIVERED',
  'APP3-B03A = COMPLETE — REVIEW_ACCEPTED',
]);

/** True when the phase records B03 in one of its legitimate states. */
export function hasAcceptedB03Status(phase) {
  return B03_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`));
}

/**
 * The exact status line `APP3-B06B` is recorded under once delivered.
 *
 * Three gates (B06A, B06B, B07) each assert this line, and each had its own
 * copy of the literal — so `APP3-B06B-C1` changing the token broke all three at
 * once. The value is asserted here, not read back out of the phase document: a
 * status derived from the document it is meant to check would accept whatever
 * was written, which is the same defect as measuring a surface by counting the
 * artifact it is supposed to constrain.
 */
export const B06B_DELIVERED_STATUS = 'APP3-B06B = COMPLETE — REVIEW_ACCEPTED';

/**
 * The status lines `APP3-B08` may legitimately be recorded under.
 *
 * Two consistent worlds and no third. While `APP3-P04` is under review B08 is
 * *blocked on that foundation* — the directive's own model — and once the
 * foundation is accepted B08 becomes accepted with it. A gate pinning a single
 * token would fail in one of the two states, and pinning none would accept a B08
 * that had quietly regressed to not-started.
 *
 * Asserted here rather than read back out of the phase document: a status
 * derived from the document it checks accepts whatever was written.
 */
export const B08_STATUS_LINES = Object.freeze([
  'APP3-B08 = BLOCKED — AWAITING_FOUNDATION_REVIEW',
  'APP3-B08 = COMPLETE — REVIEW_ACCEPTED',
]);

/** The status lines `APP3-B08-C1` may be recorded under, for the same reason. */
export const B08_C1_STATUS_LINES = Object.freeze([
  'APP3-B08-C1 = FAILED — MANUAL INTERVENTION REQUIRED',
  'APP3-B08-C1 = COMPLETE — REVIEW_ACCEPTED_AFTER_MANUAL_INTERVENTION',
]);

/**
 * True once `APP3-B06B` has published the anonymous raster intake.
 *
 * Several gates ban a *word* — "normalization", "svg" — anywhere in the OpenAPI
 * document, as a proxy for "my checkpoint published no HTTP surface". That proxy
 * held only while no delivered operation legitimately used the word. B06B's
 * intake queues normalization and refuses SVG, and says so in its published
 * description, so the proxy now fires on a correct artifact. Those gates keep
 * their real assertion — the counts and the frozen digests — and drop only the
 * word ban once this returns true.
 */
export function isB06BDelivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B06B = COMPLETE/.test(phase);
}

/** True once `APP3-P04` has published the shared Session response contract. */
export function isP04Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-P04 = COMPLETE/.test(phase);
}

/**
 * True once the autosave operation exists on the published surface.
 *
 * `APP3-P04` counts, because it can only have published responses for an
 * operation B08 had already delivered — and while the foundation is under
 * review B08 itself is recorded blocked rather than complete. Reading only the
 * B08 line would make a delivered surface look undelivered.
 */
export function isB08Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B08 = COMPLETE/.test(phase) || isP04Delivered(rootDir);
}
