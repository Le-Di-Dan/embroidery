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
