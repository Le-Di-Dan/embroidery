/**
 * Where `APP3-S03` lives, and how to read it.
 *
 * Split out of `check-app3-s03.mjs` by responsibility, and because one file
 * carrying the paths, the governance rules and the runtime rules would cross
 * the repository's 400-line source limit.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S03_FILES, S05_FILES, S06_FILES, S09_FILES } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const STOREFRONT = 'apps/storefront';
export const FEATURE = `${STOREFRONT}/src/features/design-studio`;

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  generatedClient: 'packages/api-client/src/generated/embroidery-api.ts',
  curatedClient: 'packages/api-client/src/index.ts',
  rootPackage: 'package.json',
  storefrontPackage: `${STOREFRONT}/package.json`,
  // What S03 adds.
  transform: `${FEATURE}/model/studio-transform.ts`,
  handles: `${FEATURE}/model/studio-transform-handles.ts`,
  authority: `${FEATURE}/model/studio-transform-authority.ts`,
  mapping: `${FEATURE}/model/studio-stage-mapping.ts`,
  sessionKey: `${FEATURE}/model/studio-session-key.ts`,
  documentStore: `${FEATURE}/store/studio-document.store.ts`,
  gesture: `${FEATURE}/hooks/use-studio-transform.ts`,
  overlay: `${FEATURE}/components/studio-transform-overlay.tsx`,
  // What S03 must leave exactly as it found it.
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  // What `APP3-S03-C1` adds: identity reuse for the elements a frame did not
  // change. Adapter-side, so it lives with the renderer rather than the model.
  renderIdentity: `${FEATURE}/renderer/studio-scene-identity.ts`,
  stage: `${FEATURE}/components/studio-stage.tsx`,
  stageElement: `${FEATURE}/components/studio-stage-element.tsx`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  selectionStore: `${FEATURE}/store/studio-interaction.store.ts`,
  viewportStore: `${FEATURE}/store/studio-viewport.store.ts`,
  viewport: `${FEATURE}/components/studio-stage-viewport.tsx`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  benchmark: 'tools/bench-app3-s03-transforms.mjs',
  benchmarkFixtures: 'tools/bench-app3-s03-fixtures.mjs',
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

/** The three approved section-07 design rows, and the nodes they must carry. */
export const S03_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-TRANSFORM-DESKTOP-MOVE': '606:186',
  'FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE': '606:256',
  'FIG-STUDIO-TRANSFORM-DESKTOP-ROTATE': '606:326',
});

/**
 * Studio rows belonging to checkpoints that still have not opened.
 *
 * The transform and zoom rows are deliberately absent — they are `APP3-S03`'s
 * and `APP3-S07`'s, and are asserted approved elsewhere.
 */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-LAYERS-DESKTOP-REORDER',
  'FIG-STUDIO-TEXT-DESKTOP-EDITING',
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING',
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-STAGE-SELECTED',
  'FIG-STUDIO-MOBILE-TRANSFORMSHEET',
]);

export const TABLET_REFERENCE_ROW = 'FIG-STUDIO-EDITING-TABLET-1024';
export const TABLET_REFERENCE_OWNER = 'APP3-D01-C1';

/** The frozen scene sizes the transform benchmark measures. `L` is P01's cap. */
export const SCENE_SIZES = Object.freeze({ S: 10, M: 50, L: 100 });

/** Rendering and interaction engines the locked architecture excludes. */
export const FORBIDDEN_ENGINES = Object.freeze([
  'konva',
  'react-konva',
  'fabric',
  'pixi.js',
  'interactjs',
  'interact.js',
  'moveable',
  'react-moveable',
  'react-rnd',
  'hammerjs',
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
 * breaking it, which is exactly how a second transform model would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Only the files S03 introduced, prose stripped. */
export function s03Code(rootDir) {
  return S03_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}

/** The feature minus the files S03 introduced, prose stripped. */
export function preS03Code(rootDir) {
  return featureCodeExcept(rootDir, S03_FILES);
}

/**
 * The feature minus the files `APP3-S05` introduced, prose stripped.
 *
 * The world-aware form of S03's "no text capability" rule. It names the **new**
 * files rather than the old ones, so anything added later inherits the strict
 * rule by default instead of escaping it.
 */
export function preS05Code(rootDir) {
  return featureCodeExcept(rootDir, S05_FILES);
}

/** The feature minus the files `APP3-S06` introduced. */
export function preS06Code(rootDir) {
  return featureCodeExcept(rootDir, S06_FILES);
}

function featureCodeExcept(rootDir, owned) {
  const later = new Set(owned.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !later.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * Every Studio source **except** the four files `APP3-S09` added.
 *
 * The scope a rule needs once the runtime watermark exists: the ban is kept and
 * the watermark's own files are the only place it may appear.
 */
export function preS09Code(rootDir) {
  const owned = new Set(S09_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\\\', '/')))
    .join('\n');
}
