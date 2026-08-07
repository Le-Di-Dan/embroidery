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
]);

export function acceptedSessionPaths(rootDir) {
  return SESSION_PATHS.slice(0, acceptedSurface(rootDir).designSessionPaths);
}

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
