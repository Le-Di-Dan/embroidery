/**
 * `APP3-S11` — the files the gate reads, and how it reads them.
 *
 * Shared with the mutation tests so a case can replace exactly one file in a
 * throwaway copy of the repository and prove the rule that protects it fails.
 *
 * Read-only, cross-platform pure Node: no database, no container, no network.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S11_DESIGN_ROWS, S11_FILES } from './app3-accepted-paths.mjs';

export { S11_DESIGN_ROWS, S11_FILES };

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
  storefrontPackage: `${STOREFRONT}/package.json`,
  // What `APP3-S11` adds.
  touch: `${FEATURE}/model/studio-touch.ts`,
  mobileTransform: `${FEATURE}/model/studio-mobile-transform.ts`,
  copy: `${FEATURE}/model/studio-mobile-copy.ts`,
  gestures: `${FEATURE}/hooks/use-studio-touch-gestures.ts`,
  sheets: `${FEATURE}/hooks/use-studio-mobile-sheets.ts`,
  keyboard: `${FEATURE}/hooks/use-keyboard-inset.ts`,
  sheet: `${FEATURE}/components/studio-sheet.tsx`,
  toolbar: `${FEATURE}/components/studio-mobile-toolbar.tsx`,
  surface: `${FEATURE}/components/studio-mobile-surface.tsx`,
  transformSheet: `${FEATURE}/components/studio-transform-sheet.tsx`,
  layersSheet: `${FEATURE}/components/studio-layers-sheet.tsx`,
  // What `APP3-S11` extends, and must leave otherwise intact.
  gesture: `${FEATURE}/hooks/use-studio-transform.ts`,
  viewport: `${FEATURE}/components/studio-stage-viewport.tsx`,
  viewportStore: `${FEATURE}/store/studio-viewport.store.ts`,
  viewportModel: `${FEATURE}/model/studio-viewport.ts`,
  overlay: `${FEATURE}/components/studio-transform-overlay.tsx`,
  handles: `${FEATURE}/model/studio-transform-handles.ts`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  saveState: `${FEATURE}/components/studio-save-state.tsx`,
  styles: `${FEATURE}/styles/design-studio.scss`,
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;
export const EXPECTED_PATHS = 37;
export const EXPECTED_OPERATIONS = 42;
export const EXPECTED_SCHEMAS = 84;

/** The cadence `APP3-S10` locked. `APP3-S11` may read it and may not move it. */
export const DEBOUNCE_MS = 2500;
export const MAX_DIRTY_AGE_MS = 10_000;

/**
 * Rows that must stay unapproved.
 *
 * Section 15 is the last Studio section, so every *capability* row now belongs
 * to a checkpoint that has opened. What is left is the handoff annotation — no
 * capability checkpoint consumes it, so a blanket approval still moves it and
 * this list still has something in it. A rule with nothing left to guard is the
 * shape of a gate that has quietly stopped being one.
 */
export const LATER_DESIGN_ROWS = Object.freeze(['FIG-APP3-HANDOFF-DEPENDENCY']);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * One source file with its prose removed.
 *
 * Every rule below runs against this rather than the raw text. A gate that read
 * comments fires on the paragraph that honestly explains why something is
 * forbidden — the failure `APP3-B06B`, `APP3-B06C`, `APP3-S06`, `APP3-S04`,
 * `APP3-S08-C1` and `APP3-S10` each recorded at least once.
 */
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
 * only inspected the files it knew about would be satisfied by a *new* file
 * breaking it, which is exactly how a second gesture engine would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Only the files `APP3-S11` introduced, prose stripped. */
export function s11Code(rootDir) {
  return S11_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}

/** Every Studio source **except** the files `APP3-S11` owns. */
export function outsideS11Code(rootDir) {
  const owned = new Set(S11_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * Every customer-visible string a copy module publishes, as whole values.
 *
 * Quoted **and** templated. Whole values rather than one joined blob, because a
 * rule about a *label* stated as a substring also fires on every sentence that
 * happens to contain it — the `APP3-S08-C1` failure, not repeated here.
 */
export function publishedValues(source) {
  const stripped = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
  return [
    ...[...stripped.matchAll(/'([^'\n]*)'/g)].map((match) => match[1] ?? ''),
    ...[...stripped.matchAll(/`([^`]*)`/g)].map((match) => match[1] ?? ''),
  ];
}
