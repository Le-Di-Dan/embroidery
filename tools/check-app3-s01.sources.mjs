/**
 * Where `APP3-S01` lives, and how to read it.
 *
 * Split out of `check-app3-s01.mjs` by responsibility, and because one file
 * carrying the paths, the governance rules and the runtime rules crossed the
 * repository's 400-line source limit. Both checker modules import from here, so
 * a file that moves is renamed once rather than in two places that can disagree.
 *
 * Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S03_FILES,
  S05_FILES,
  S06_FILES,
  S07_FILES,
  isS05Delivered,
  isS06Delivered,
  S04_FILES,
  isS04Delivered,
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
  curatedClient: 'packages/api-client/src/index.ts',
  rootPackage: 'package.json',
  navigation: `${STOREFRONT}/src/features/storefront-shell/model/storefront-navigation.ts`,
  route: `${STOREFRONT}/src/app/san-pham/[slug]/thiet-ke/page.tsx`,
  island: `${FEATURE}/bootstrap/studio-bootstrap-island.tsx`,
  provider: `${FEATURE}/bootstrap/studio-query-provider.tsx`,
  screen: `${FEATURE}/components/studio-screen.tsx`,
  selection: `${FEATURE}/model/studio-selection.ts`,
  placementModel: `${FEATURE}/model/studio-placement.ts`,
  templateModel: `${FEATURE}/model/studio-template.ts`,
  queryKeys: `${FEATURE}/model/studio-query-keys.ts`,
  templateService: `${FEATURE}/services/studio-template.client.ts`,
  sessionService: `${FEATURE}/services/studio-session.client.ts`,
  previewHook: `${FEATURE}/hooks/use-template-preview.ts`,
  detailHook: `${FEATURE}/hooks/use-template-detail.ts`,
  sessionHook: `${FEATURE}/hooks/use-studio-session.ts`,
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;

/** The canonical Studio route, written here exactly once. */
export const STUDIO_ROUTE = '/san-pham/[slug]/thiet-ke';

/**
 * Spellings of a Studio route that no ruling has ever authorised.
 *
 * Each implies a Studio that exists apart from a Product, and none of them can
 * name the `product → side → area` placement a Design Session is opened on.
 */
export const REJECTED_STUDIO_ROUTES = Object.freeze([
  'src/app/studio',
  'src/app/editor',
  'src/app/thiet-ke',
  'src/app/design-session',
  'src/app/san-pham/[slug]/studio',
]);

/** The five design rows S01 consumes, and the nodes they must still carry. */
export const S01_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-SHELL-DESKTOP-DEFAULT': '604:5',
  'FIG-STUDIO-SHELL-DESKTOP-PREVIEWPENDING': '604:46',
  'FIG-STUDIO-SHELL-DESKTOP-EMPTY': '604:73',
  'FIG-STUDIO-SHELL-DESKTOP-EXPIRED': '604:85',
  'FIG-STUDIO-SHELL-MOBILE-DEFAULT': '604:100',
});

/**
 * Studio rows belonging to checkpoints that have not opened.
 *
 * One row per later Studio checkpoint rather than all of them: the property
 * under test is that approval stayed **scoped**, and a blanket approval would
 * move every one of these at once.
 */
export const LATER_STUDIO_ROWS = Object.freeze([
  'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED',
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT',
  'FIG-STUDIO-TEXT-DESKTOP-EDITING',
  'FIG-STUDIO-IMAGE-DESKTOP-UPLOADING',
  'FIG-STUDIO-ZOOM-DESKTOP-FIT',
  /*
   * The four rows whose checkpoints have still not opened (`APP3-S04`).
   *
   * Added when `APP3-S04` delivered, because at that moment every row above
   * belonged to a checkpoint that *had* opened and the world-aware exclusion
   * emptied this rule completely — it still ran, still passed, and asserted
   * nothing. A blanket-approval rule with no closed row left in it is the
   * shape of a gate that has quietly stopped being a gate.
   */
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-LAYERSSHEET',
]);

/** The six generated operations S01 owns, and nothing else. */
export const CONSUMED_OPERATIONS = Object.freeze([
  'publicProductPlacementGet',
  'publicDesignTemplateList',
  'publicDesignTemplateDetail',
  'publicDesignTemplateAssetGet',
  'publicDesignSessionCreate',
  'publicDesignSessionResume',
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
 * Every production source file of the feature plus the route segment, prose
 * stripped.
 *
 * The whole-feature bans run against this rather than against a named list:
 * a rule that only inspected the files it knew about would be satisfied by a
 * new file breaking it.
 */
export function featureCode(rootDir) {
  const files = [
    ...collect(join(rootDir, FEATURE), /\.tsx?$/),
    join(rootDir, CANONICAL_FILES.route),
  ];
  return files
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * The files `APP3-S02` added to this feature, named exactly.
 *
 * Several rules here were written when the Studio had no stage, and they are
 * the rules that keep it having exactly one. Making them world-aware means
 * splitting the feature rather than loosening the rule: everything S01 owns
 * still may not reach a background operation, hold a store, or render an
 * `<svg>`, and the stage may — once.
 *
 * The list names the S02 files rather than the S01 ones on purpose. A file
 * added tomorrow is not on it, so it inherits the strict S01 rules by default.
 * A list of S01 files would have let a new file escape every one of them.
 */
export const S02_FILES = Object.freeze([
  'components/studio-stage.tsx',
  'components/studio-stage-background-notice.tsx',
  'components/studio-stage-element.tsx',
  'components/studio-stage-screen.tsx',
  'components/studio-stage-selection.tsx',
  'components/studio-stage-unavailable.tsx',
  'hooks/use-side-background.ts',
  'model/studio-stage-copy.ts',
  'model/studio-stage-label.ts',
  'renderer/studio-paint.ts',
  'renderer/studio-scene.ts',
  'renderer/studio-svg-matrix.ts',
  'services/studio-background.client.ts',
  'store/studio-interaction.store.ts',
]);

/** The three section-06 rows `APP3-S02` legitimately approves. */
export const S02_DESIGN_ROWS = Object.freeze([
  'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED',
  'FIG-STUDIO-STAGE-DESKTOP-SELECTED',
  'FIG-STUDIO-STAGE-DESKTOP-EMPTY',
]);

/**
 * The feature minus what later checkpoints added, plus the route. Prose stripped.
 *
 * The exclusion names the files S02, S07, S03 and S05 **introduced**, never the
 * files S01 owned. Everything else — including a file that does not exist yet —
 * is read as S01's and inherits its strict rules by default, which is the only
 * version of this rule that a new file cannot walk around.
 *
 * S05's files are excluded only once S05 has delivered, for the same reason the
 * others are listed at all: before that, a file with one of those names is not a
 * checkpoint's legitimate work, and the strict rule must still bite.
 */
export function s01FeatureCode(rootDir) {
  const later = new Set(
    [
      ...S02_FILES,
      ...S07_FILES,
      ...S03_FILES,
      ...(isS05Delivered(rootDir) ? S05_FILES : []),
      ...(isS06Delivered(rootDir) ? S06_FILES : []),
      ...(isS04Delivered(rootDir) ? S04_FILES : []),
    ].map((path) => join(rootDir, FEATURE, ...path.split('/'))),
  );
  const files = [
    ...collect(join(rootDir, FEATURE), /\.tsx?$/).filter((path) => !later.has(path)),
    join(rootDir, CANONICAL_FILES.route),
  ];
  return files
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}
