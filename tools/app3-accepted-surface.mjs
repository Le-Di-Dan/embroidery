/**
 * The accepted API surface, as of whichever APP3 checkpoints have shipped.
 *
 * Every APP3 gate asserts that the published document still matches the surface
 * its own checkpoint left behind, which is what stops an unrelated change from
 * quietly adding a route. Pinning the numbers in each gate made that assertion
 * true and unmaintainable at once: the checkpoint that legitimately adds an
 * operation has to edit every earlier gate to say so.
 *
 * So the baseline is derived once, from the phase status block — the same record
 * human review signs off. A gate asks what the accepted surface *is*; it does
 * not carry its own copy of history.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';

/** Surfaces in delivery order. The last one the phase records complete wins. */
const SURFACES = Object.freeze([
  {
    // `APP3-B04` — the three LC-24 lifecycle transitions. Three paths, three
    // operations, and three request bodies; restore is `APP3-B04A`'s and is not
    // in this world.
    marker: /\nAPP3-B04 = COMPLETE/,
    paths: 29,
    operations: 34,
    schemas: 76,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B03A` — the draft document save. One operation on a new path; the
    // schema count moves by one for its request body, which references the
    // already-published `DesignDocument` rather than restating it.
    marker: /\nAPP3-B03A = COMPLETE/,
    paths: 26,
    operations: 31,
    schemas: 73,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B03` — the first Admin Design Template surface. Two paths and three
    // operations: create and list share the collection, detail takes the id.
    // The Session numbers below are untouched by it, which is the point of
    // keeping them a separate field rather than a share of the total.
    marker: /\nAPP3-B03 = COMPLETE/,
    paths: 25,
    operations: 30,
    // 66 after `APP3-P04`; +6 here for the detail, list and summary responses
    // plus the scope and version objects and the list envelope. Measured from
    // the artifact, never chosen.
    schemas: 72,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-P04` adds no path and no operation — it publishes the *responses*
    // the three Session operations already returned. It is a distinct world
    // rather than an edit to B08's because the foundation is reviewed on its
    // own, and while it is under review `APP3-B08` is recorded blocked; a
    // surface keyed only on B08 would then claim the pre-B08 numbers against a
    // post-B08 artifact.
    marker: /\nAPP3-P04 = COMPLETE/,
    paths: 23,
    operations: 27,
    // 63 after `APP3-B08-C1`; +3 here for the shared snapshot and its optional
    // scope and lineage. Measured from the artifact, never chosen.
    schemas: 66,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    marker: /\nAPP3-B08 = COMPLETE/,
    paths: 23,
    operations: 27,
    // 50 at `APP3-B08`, then +13 at `APP3-B08-C1`, which publishes the P01
    // Design Document as real components instead of an open object. The
    // definitions are generated from P01's TypeScript types, so this number
    // moves when the document type does.
    schemas: 63,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    marker: /\nAPP3-B06B = COMPLETE/,
    paths: 22,
    operations: 26,
    schemas: 49,
    designSessionRoutes: true,
    designSessionPaths: 3,
  },
  {
    marker: /\nAPP3-B07 = COMPLETE/,
    paths: 21,
    operations: 25,
    schemas: 48,
    designSessionRoutes: true,
    designSessionPaths: 2,
  },
  // `schemas` is absent before B07: no checkpoint up to B02 ever recorded a
  // component count, and inventing one here would be a number the gate then
  // enforces against nothing. Consumers skip the assertion when it is absent
  // rather than compare against a guess.
  {
    marker: /\nAPP3-B02 = COMPLETE/,
    paths: 19,
    operations: 23,
    designSessionRoutes: false,
    designSessionPaths: 0,
  },
]);

const BASELINE = Object.freeze({
  paths: 19,
  operations: 23,
  designSessionRoutes: false,
  designSessionPaths: 0,
});

export function acceptedSurface(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return SURFACES.find((surface) => surface.marker.test(phase)) ?? BASELINE;
}

/**
 * The Session paths the accepted surface may contain, in delivery order.
 *
 * Gates that rule on some *other* subject — `APP3-G01` on placement, `APP3-B01`
 * and `APP3-DB01` on their own additions — still have to allow these, because a
 * Session path matches their pattern without being theirs. Each carrying its own
 * copy is how one of them ends up refusing a route the phase already accepted.
 */
const SESSION_PATHS = Object.freeze([
  '/api/public/design-sessions',
  '/api/public/design-sessions/{sessionId}/resume',
  '/api/public/design-sessions/{sessionId}/assets',
  '/api/public/design-sessions/{sessionId}/document',
]);

export function acceptedSessionPaths(rootDir) {
  return SESSION_PATHS.slice(0, acceptedSurface(rootDir).designSessionPaths);
}

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

/** The three `APP3-B04` adds. Restore is `APP3-B04A`'s and is deliberately absent. */
const ADMIN_TEMPLATE_LIFECYCLE_PATHS = Object.freeze([
  '/api/admin/design-templates/{templateId}/publish',
  '/api/admin/design-templates/{templateId}/unpublish',
  '/api/admin/design-templates/{templateId}/archive',
]);

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

/** True once `APP3-B04` has published the LC-24 lifecycle transitions. */
export function isB04Delivered(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return /\nAPP3-B04 = COMPLETE/.test(phase);
}

export function acceptedAdminTemplatePaths(rootDir) {
  if (!isB03Delivered(rootDir)) return [];
  const paths = [...ADMIN_TEMPLATE_PATHS];
  if (isB03ADelivered(rootDir)) paths.push(ADMIN_TEMPLATE_SAVE_PATH);
  if (isB04Delivered(rootDir)) paths.push(...ADMIN_TEMPLATE_LIFECYCLE_PATHS);
  return paths;
}

/** The three lifecycle paths, for gates that must assert their absence before B04. */
export function lifecycleAdminTemplatePaths() {
  return [...ADMIN_TEMPLATE_LIFECYCLE_PATHS];
}

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
