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
    // `APP3-B06C` — the one private Design Session asset delivery, `IMP-D044`
    // PO-06 class 3 and the last of the three. One path, one operation and **no
    // schema**: the response is binary and the request has no body, so there is
    // no component to publish. 83 is measured from the artifact, not assumed
    // unchanged — the count happening to match `APP3-B05A`'s is a fact about
    // this checkpoint publishing no component, not an assumption carried over.
    marker: /\nAPP3-B06C = COMPLETE/,
    paths: 36,
    operations: 41,
    schemas: 83,
    designSessionRoutes: true,
    designSessionPaths: 5,
  },
  {
    // `APP3-B05A` — the one anonymous public Template asset delivery. One path,
    // one operation and **no schema**: the response is binary and the request has
    // no body, so there is no component to publish. The count is measured from
    // the artifact rather than assumed unchanged.
    marker: /\nAPP3-B05A = COMPLETE/,
    paths: 35,
    operations: 40,
    schemas: 83,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B04A` — `TR-LC24-06`, the fourth and last LC-24 transition. One
    // path, one operation and one request-body schema; no response component,
    // because it answers the Admin detail view `APP3-B03` already publishes.
    marker: /\nAPP3-B04A = COMPLETE/,
    paths: 34,
    operations: 39,
    schemas: 83,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B03B` — the one-time initial scope assignment, a just-in-time
    // unblock for `APP3-A03`: a Template created unscoped through the Admin UI
    // could never be authored, because `APP3-P01` requires a placement snapshot
    // in every Design Document. One path, one operation and one request-body
    // schema; no response component, because it answers the detail view B03
    // already publishes.
    marker: /\nAPP3-B03B = COMPLETE/,
    paths: 33,
    operations: 38,
    schemas: 82,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B02A` — the one authenticated Admin Side-background delivery, a
    // just-in-time unblock for `APP3-A01`'s placement preview. One path, one
    // operation and **no schema**: the response is binary, so there is no
    // component to publish.
    marker: /\nAPP3-B02A = COMPLETE/,
    paths: 32,
    operations: 37,
    schemas: 81,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
  {
    // `APP3-B05` — the two anonymous public Template reads. Two paths, two
    // operations, and five response components: the list envelope, the summary,
    // the detail, the scope and the published version. The Design Document is
    // *not* among them — the detail references the component `APP3-P01` already
    // publishes rather than restating one.
    marker: /\nAPP3-B05 = COMPLETE/,
    paths: 31,
    operations: 36,
    schemas: 81,
    designSessionRoutes: true,
    designSessionPaths: 4,
  },
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
  // `APP3-B06C`. Last in delivery order, so every earlier world keeps exactly the
  // paths it had: the slice below is what makes a half-flipped world impossible
  // to express.
  '/api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview',
]);

export function acceptedSessionPaths(rootDir) {
  return SESSION_PATHS.slice(0, acceptedSurface(rootDir).designSessionPaths);
}

/**
 * The per-checkpoint path authority, re-exported so every gate keeps one entry
 * point. It lives in its own module because it answers a different question
 * from the surface counts above — and because this file would otherwise exceed
 * the repository's 400-line source limit.
 */
export * from './app3-accepted-paths.mjs';

/**
 * The source-file authority, re-exported for the same reason: one entry point
 * per gate. It answers "which files carry the Admin Template surface", which the
 * `APP3-B04A` responsibility split made a question worth asking once.
 */
export * from './app3-template-sources.mjs';

/**
 * Every tool module this authority is assembled from.
 *
 * Each gate's regression harness runs the checker against a throwaway copy of
 * the repository, and copies an explicit list of files into it. Importing this
 * module now pulls in two more, so a harness listing only the entry point gets
 * `ERR_MODULE_NOT_FOUND` — every case failing at once, for a reason that has
 * nothing to do with the rules under test. The list is published here so a
 * harness copies *the authority* rather than a file it remembers.
 */
export const APP3_SURFACE_TOOL_FILES = Object.freeze([
  'tools/app3-accepted-surface.mjs',
  'tools/app3-accepted-paths.mjs',
  'tools/app3-template-sources.mjs',
]);
