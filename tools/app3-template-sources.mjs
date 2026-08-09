/**
 * Where the Admin Design Template HTTP contract and persistence actually live.
 *
 * Four gates (`B03`, `B03A`, `B03B`, `B04`) scan "the controller" and "the
 * adapter" for properties no runtime check can show — a compare-and-set in the
 * predicate, a guard pair on every write, a route that must not exist. Each held
 * its own path literal, and `APP3-B04A` split both files by responsibility to
 * bring them under the CLAUDE.md §6 limit.
 *
 * That split would have broken all four in the same instant, and — worse —
 * would have made every `not.toMatch` style rule pass for the wrong reason: a
 * ban asserted against a file the code has left is not a ban. So the surface is
 * named once, here, and a gate asks for the surface it means rather than for a
 * file it remembers.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESIGN = 'apps/api/src/modules/design';

/** Both Admin Template controllers, plus the error translation they share. */
export const ADMIN_TEMPLATE_CONTROLLER_FILES = Object.freeze([
  `${DESIGN}/presentation/admin-design-template-authoring.controller.ts`,
  `${DESIGN}/presentation/admin-design-template-lifecycle.controller.ts`,
  `${DESIGN}/presentation/design-template-http-errors.ts`,
]);

/** The lifecycle controller alone, for rules that are about the transitions only. */
export const ADMIN_TEMPLATE_LIFECYCLE_CONTROLLER_FILE = `${DESIGN}/presentation/admin-design-template-lifecycle.controller.ts`;

/** The whole Drizzle adapter: reads, authoring writes and lifecycle writes. */
export const ADMIN_TEMPLATE_ADAPTER_FILES = Object.freeze([
  `${DESIGN}/infrastructure/persistence/drizzle-design-template.repository.ts`,
  `${DESIGN}/infrastructure/persistence/design-template-authoring.writes.ts`,
  `${DESIGN}/infrastructure/persistence/design-template-lifecycle.writes.ts`,
]);

/**
 * Reads every named file and joins them.
 *
 * A missing file yields `undefined` for the whole surface rather than a silent
 * gap: a gate scanning three files of which one vanished would report on two
 * and call it a pass.
 */
function readSurface(rootDir, files) {
  const contents = files.map((relative) => {
    const path = join(rootDir, relative);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  });
  return contents.includes(undefined) ? undefined : contents.join('\n');
}

export function readAdminTemplateControllers(rootDir) {
  return readSurface(rootDir, ADMIN_TEMPLATE_CONTROLLER_FILES);
}

export function readAdminTemplateLifecycleController(rootDir) {
  return readSurface(rootDir, [ADMIN_TEMPLATE_LIFECYCLE_CONTROLLER_FILE]);
}

export function readAdminTemplateAdapter(rootDir) {
  return readSurface(rootDir, ADMIN_TEMPLATE_ADAPTER_FILES);
}

/** Every file carrying the Admin Template surface, for a file-size sweep. */
export function adminTemplateSurfaceFiles() {
  return [...ADMIN_TEMPLATE_CONTROLLER_FILES, ...ADMIN_TEMPLATE_ADAPTER_FILES];
}
