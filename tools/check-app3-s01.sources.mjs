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
