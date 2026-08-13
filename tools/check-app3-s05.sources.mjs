/**
 * Where `APP3-S05` lives, and how to read it.
 *
 * Split out of `check-app3-s05.mjs` by responsibility, and because one file
 * carrying the paths, the governance rules and the runtime rules would cross the
 * repository's soft limit for a checker.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S05_DESIGN_ROWS,
  S05_FILES,
  S05_STATUS_LINES,
  acceptedSurface,
  isS05Delivered,
  S09_FILES,
  S10_FILES,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const STOREFRONT = 'apps/storefront';
export const FEATURE = `${STOREFRONT}/src/features/design-studio`;

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  generatedClient: 'packages/api-client/src/generated/embroidery-api.ts',
  rootPackage: 'package.json',
  // What S05 adds.
  fields: `${FEATURE}/model/studio-text-fields.ts`,
  authority: `${FEATURE}/model/studio-text-authority.ts`,
  copy: `${FEATURE}/model/studio-text-copy.ts`,
  controlledFont: `${FEATURE}/hooks/use-controlled-font.ts`,
  controller: `${FEATURE}/hooks/use-studio-text.ts`,
  inspector: `${FEATURE}/components/studio-text-inspector.tsx`,
  controls: `${FEATURE}/components/studio-text-controls.tsx`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  // What `APP3-S05-C1` adds: where the inspector goes on each viewport, and
  // which exact controlled face the browser was asked about.
  panel: `${FEATURE}/components/studio-text-panel.tsx`,
  drawer: `${FEATURE}/components/studio-text-drawer.tsx`,
  responsive: `${FEATURE}/model/studio-responsive.ts`,
  tier: `${FEATURE}/hooks/use-studio-viewport-tier.ts`,
  variant: `${FEATURE}/model/studio-font-variant.ts`,
  // What S05 must leave exactly as it found it.
  documentStore: `${FEATURE}/store/studio-document.store.ts`,
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  stageElement: `${FEATURE}/components/studio-stage-element.tsx`,
  stageTopbar: FEATURE + '/components/studio-stage-topbar.tsx',
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  stagePanels: `${FEATURE}/components/studio-stage-panels.tsx`,
  // `APP3-S07`'s persistent control strip below the stage. Named so the gate can
  // assert what it must *not* acquire.
  stageControls: `${FEATURE}/components/studio-stage-controls.tsx`,
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

/** The Inter binaries `APP3-F01` acquired. Named, so a copy cannot be silent. */
export const CONTROLLED_FONT_ASSETS = Object.freeze([
  'packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2',
  'packages/design-document/assets/fonts/inter/4.1/InterVariable-Italic.woff2',
]);

/** Studio rows belonging to checkpoints that still have not opened. */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-LAYERS-DESKTOP-REORDER',
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING',
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-STAGE-SELECTED',
  'FIG-STUDIO-MOBILE-TRANSFORMSHEET',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with its prose removed, so a ban never fires on the rule explaining it. */
export function code(rootDir, key) {
  return (read(rootDir, key) ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
}

export function collect(dir, pattern) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Every production source file of the Studio feature, prose stripped.
 *
 * The whole-feature rules run against this rather than a named list: a rule that
 * only inspected the files it knew about would be satisfied by a new file
 * breaking it, which is exactly how a second font list would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Only the files S05 introduced, prose stripped. */
export function s05Code(rootDir) {
  return S05_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}

/**
 * Every Studio source **except** the four files `APP3-S09` added.
 *
 * The scope a rule needs once the runtime watermark exists: the ban is kept and
 * the watermark's own files are the only place it may appear.
 */
export function preS09Code(rootDir) {
  return featureCodeExcept(rootDir, S09_FILES);
}

/**
 * Every Studio source **except** the twelve files `APP3-S10` added.
 *
 * The scope the autosave and browser-storage rules need once saving exists: both
 * are kept exactly as written for every file S10 did not introduce, so the text
 * capability still saves nothing and keeps no draft that outlives the tab.
 */
export function preS10Code(rootDir) {
  return featureCodeExcept(rootDir, S10_FILES);
}

function featureCodeExcept(rootDir, owned) {
  const skip = new Set(owned.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !skip.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\\\', '/')))
    .join('\n');
}

/**
 * The stage screen **and** the composition file it mounts.
 *
 * `APP3-S08` moved the panel mounts out of `StudioStageScreen` into
 * `StudioStagePanels` to stay inside the 400-line limit. The rules below are
 * about *where each capability is mounted*, which is still one decision — so
 * they read the pair rather than one file. A rule anchored to a single path dies
 * the moment one file becomes two (`APP3-B04A`); this is the same repair.
 */
export function compositionCode(rootDir) {
  return `${code(rootDir, 'stageScreen')}\n${code(rootDir, 'stagePanels')}`;
}
