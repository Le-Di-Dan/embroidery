/**
 * Where `APP3-S02` lives, and how to read it.
 *
 * Split out of `check-app3-s02.mjs` by responsibility and because one file
 * carrying the paths, the governance rules and the runtime rules would cross
 * the repository's 400-line source limit. Both checker modules import from
 * here, so a file that moves is renamed once rather than in two places that can
 * disagree.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S03_FILES, S04_FILES, S07_FILES } from './app3-accepted-surface.mjs';

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
  screen: `${FEATURE}/components/studio-screen.tsx`,
  // The adapter — the boundary this checkpoint exists to create.
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  svgMatrix: `${FEATURE}/renderer/studio-svg-matrix.ts`,
  paint: `${FEATURE}/renderer/studio-paint.ts`,
  // The scene, drawn.
  stage: `${FEATURE}/components/studio-stage.tsx`,
  stageElement: `${FEATURE}/components/studio-stage-element.tsx`,
  stageSelection: `${FEATURE}/components/studio-stage-selection.tsx`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  stageUnavailable: `${FEATURE}/components/studio-stage-unavailable.tsx`,
  // Runtime interaction state, and the one media path the stage may take.
  store: `${FEATURE}/store/studio-interaction.store.ts`,
  backgroundHook: `${FEATURE}/hooks/use-side-background.ts`,
  backgroundService: `${FEATURE}/services/studio-background.client.ts`,
  sessionHook: `${FEATURE}/hooks/use-studio-session.ts`,
  styles: `${FEATURE}/styles/design-studio.scss`,
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

/** The three approved section-06 design rows, and the nodes they must carry. */
export const S02_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED': '606:3',
  'FIG-STUDIO-STAGE-DESKTOP-SELECTED': '606:63',
  'FIG-STUDIO-STAGE-DESKTOP-EMPTY': '606:133',
});

/**
 * Studio rows belonging to checkpoints that have not opened.
 *
 * One row per later Studio capability rather than all of them: the property
 * under test is that approval stayed **scoped**, and a blanket Studio approval
 * would move every one of these at once.
 */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-TRANSFORM-DESKTOP-MOVE',
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-TEXT-DESKTOP-EDITING',
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING',
  'FIG-STUDIO-ZOOM-DESKTOP-FIT',
  // The rows whose checkpoints have still not opened (added at `APP3-S04`,
  // when every row above had become one an opened checkpoint owns and the
  // world-aware exclusion emptied this rule completely).
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-LAYERSSHEET',
]);

/**
 * The shared responsive reference, owned by `APP3-D01-C1` and not by S02.
 *
 * It shows the whole editing surface across S02–S11. Re-attributing it to this
 * checkpoint would quietly turn a reference into a licence for every capability
 * drawn on it.
 */
export const TABLET_REFERENCE_ROW = 'FIG-STUDIO-EDITING-TABLET-1024';
export const TABLET_REFERENCE_OWNER = 'APP3-D01-C1';

/** The one generated operation S02 adds to the Studio's reach. */
export const CONSUMED_OPERATION = 'publicProductSideBackgroundGet';

/**
 * Rendering and interaction engines the locked architecture excludes.
 *
 * `IMP-D026` and `ADR-APP0-001` lock native SVG rendered by React with no
 * rendering-engine dependency. These names are checked against the Storefront's
 * production manifest and against its source, because a dependency can arrive
 * either way.
 */
export const FORBIDDEN_ENGINES = Object.freeze([
  'konva',
  'react-konva',
  'fabric',
  'pixi.js',
  'pixi',
  'interactjs',
  'interact.js',
  'three',
  '@svgdotjs/svg.js',
  'paper',
]);

/** The two internal packages S02 is the Storefront's first consumer of. */
export const REQUIRED_WORKSPACE_PACKAGES = Object.freeze([
  '@embroidery/design-document',
  '@embroidery/design-engine',
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
 * The whole-feature rules run against this rather than against a named list: a
 * rule that only inspected the files it knew about would be satisfied by a new
 * file breaking it — which is exactly how a second renderer would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * The feature minus the files `APP3-S07` and `APP3-S03` introduced, prose stripped.
 *
 * S02 banned every pointer gesture and every measurement of the browser's
 * layout across the whole feature. The two interaction checkpoints legitimately
 * need one bounded use of each — S07 for the viewport, S03 for the transform
 * chrome — so the bans keep biting everywhere else, and the exclusion names the
 * **new** files rather than the ones S02 owned. A file added tomorrow is
 * therefore governed by the strict rule by default.
 *
 * The exclusion is a **parameter** rather than a constant, because each ban is
 * opened by its own checkpoint: rewinding S03 alone must put the pointer
 * gestures back even though S07 is still delivered. A single merged list would
 * have left them legal in a world where nothing had authorised them.
 */
export function s02FeatureCode(rootDir, openedFiles = [...S07_FILES, ...S03_FILES]) {
  const later = new Set(openedFiles.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !later.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Every Storefront production source file, prose stripped. Used for import bans. */
export function storefrontCode(rootDir) {
  return collect(join(rootDir, `${STOREFRONT}/src`), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * Every Studio source **except** the six files `APP3-S04` added.
 *
 * The scope a rule needs once a capability it was written before has legitimate
 * ownership of a marker: the ban is kept and the owner's own files are the only
 * place it may appear.
 */
export function preS04Code(rootDir) {
  const owned = new Set(S04_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}
