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
  { marker: /\nAPP3-B07 = COMPLETE/, paths: 21, operations: 25, designSessionRoutes: true },
  { marker: /\nAPP3-B02 = COMPLETE/, paths: 19, operations: 23, designSessionRoutes: false },
]);

const BASELINE = Object.freeze({ paths: 19, operations: 23, designSessionRoutes: false });

export function acceptedSurface(rootDir) {
  const path = join(rootDir, PHASE);
  const phase = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return SURFACES.find((surface) => surface.marker.test(phase)) ?? BASELINE;
}
