/**
 * Where `APP3-S07` lives, and how to read it.
 *
 * Split out of `check-app3-s07.mjs` by responsibility, and because one file
 * carrying the paths, the governance rules and the runtime rules would cross the
 * repository's 400-line source limit. Every checker module imports from here, so
 * a file that moves is renamed once rather than in three places that can
 * disagree.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S07_FILES } from './app3-accepted-surface.mjs';

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
  // What S07 adds.
  viewportModel: `${FEATURE}/model/studio-viewport.ts`,
  viewportCopy: `${FEATURE}/model/studio-viewport-copy.ts`,
  viewportStore: `${FEATURE}/store/studio-viewport.store.ts`,
  viewport: `${FEATURE}/components/studio-stage-viewport.tsx`,
  controls: `${FEATURE}/components/studio-stage-controls.tsx`,
  // What S07 must leave exactly as it found it.
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  stage: `${FEATURE}/components/studio-stage.tsx`,
  stageElement: `${FEATURE}/components/studio-stage-element.tsx`,
  stageSelection: `${FEATURE}/components/studio-stage-selection.tsx`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  selectionStore: `${FEATURE}/store/studio-interaction.store.ts`,
  backgroundHook: `${FEATURE}/hooks/use-side-background.ts`,
  queryKeys: `${FEATURE}/model/studio-query-keys.ts`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  // The predecessor gate this checkpoint had to make world-aware.
  s02Runtime: 'tools/check-app3-s02-runtime.mjs',
  s02Bans: 'tools/check-app3-s02-bans.mjs',
  benchmark: 'tools/bench-app3-s07-viewport.mjs',
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

/** The three approved section-11 design rows, and the nodes they must carry. */
export const S07_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-ZOOM-DESKTOP-FIT': '609:3',
  'FIG-STUDIO-ZOOM-DESKTOP-ZOOMED': '609:51',
  'FIG-STUDIO-ZOOM-DESKTOP-SAFEAREAHIDDEN': '609:99',
});

/**
 * Studio rows belonging to checkpoints that still have not opened.
 *
 * One row per remaining capability rather than all of them: the property under
 * test is that approval stayed **scoped**, and a blanket Studio approval would
 * move every one of these at once. The zoom rows are deliberately absent —
 * they are this checkpoint's, and are asserted approved above.
 */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-TRANSFORM-DESKTOP-MOVE',
  'FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE',
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-TEXT-DESKTOP-EDITING',
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING',
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-STAGE-SELECTED',
]);

/** The shared responsive reference, owned by `APP3-D01-C1` and not by S07. */
export const TABLET_REFERENCE_ROW = 'FIG-STUDIO-EDITING-TABLET-1024';
export const TABLET_REFERENCE_OWNER = 'APP3-D01-C1';

/** Rendering and interaction engines the locked architecture excludes. */
export const FORBIDDEN_ENGINES = Object.freeze([
  'konva',
  'react-konva',
  'fabric',
  'pixi.js',
  'pixi',
  'interactjs',
  'interact.js',
  'three',
  'panzoom',
  'react-zoom-pan-pinch',
  'd3-zoom',
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
 * The whole-feature rules run against this rather than against a named list: a
 * rule that only inspected the files it knew about would be satisfied by a new
 * file breaking it — which is exactly how a second viewport, or a wheel handler
 * restoring the continuous-scale path, would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** The feature minus the five files S07 introduced, prose stripped. */
export function preS07Code(rootDir) {
  const later = new Set(S07_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !later.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Only the files S07 introduced, prose stripped. */
export function s07Code(rootDir) {
  return S07_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}
