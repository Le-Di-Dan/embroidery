/**
 * `APP3-S10` — the files the gate reads, and how it reads them.
 *
 * Shared with the mutation tests so a case can replace exactly one file in a
 * throwaway copy of the repository and prove the rule that protects it fails.
 *
 * Read-only, cross-platform pure Node: no database, no container, no network.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S10_DESIGN_ROWS, S10_FILES, S11_FILES } from './app3-accepted-paths.mjs';

export { S10_DESIGN_ROWS, S10_FILES };

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
  // What `APP3-S10` adds.
  model: `${FEATURE}/model/studio-autosave.ts`,
  copy: `${FEATURE}/model/studio-autosave-copy.ts`,
  handle: `${FEATURE}/model/studio-resume-handle.ts`,
  resumeScope: `${FEATURE}/model/studio-resume-scope.ts`,
  controller: `${FEATURE}/hooks/use-studio-autosave.ts`,
  resumeHook: `${FEATURE}/hooks/use-studio-resume.ts`,
  warning: `${FEATURE}/hooks/use-studio-unsaved-warning.ts`,
  service: `${FEATURE}/services/studio-autosave.client.ts`,
  chip: `${FEATURE}/components/studio-save-chip.tsx`,
  state: `${FEATURE}/components/studio-save-state.tsx`,
  topbar: `${FEATURE}/components/studio-stage-topbar.tsx`,
  resumePrompt: `${FEATURE}/components/studio-resume-prompt.tsx`,
  // What `APP3-S10` extends, and must leave otherwise intact.
  expired: `${FEATURE}/components/studio-session-expired.tsx`,
  screen: `${FEATURE}/components/studio-screen.tsx`,
  stageScreen: `${FEATURE}/components/studio-stage-screen.tsx`,
  documentStore: `${FEATURE}/store/studio-document.store.ts`,
  drawer: `${FEATURE}/components/studio-text-drawer.tsx`,
  styles: `${FEATURE}/styles/design-studio.scss`,
});

export const MIGRATIONS = 'packages/database/migrations';
export const EXPECTED_MIGRATIONS = 34;
export const ROOT_SCRIPTS = 30;
export const EXPECTED_PATHS = 37;
export const EXPECTED_OPERATIONS = 42;
export const EXPECTED_SCHEMAS = 84;

/** The cadence `APP3-S10` locks, restated here so the gate reads both ends. */
export const DEBOUNCE_MS = 2500;
export const MAX_DIRTY_AGE_MS = 10_000;

/**
 * Rows that must stay unapproved: they belong to `APP3-S11`.
 *
 * Every desktop row in the phase is now owned by an opened checkpoint, so this
 * is the whole of what a blanket approval could still release — and it is the
 * mobile capability, which is exactly the one this checkpoint must not start.
 */
export const LATER_DESIGN_ROWS = Object.freeze([
  'FIG-STUDIO-MOBILE-STAGE-SELECTED',
  'FIG-STUDIO-MOBILE-TRANSFORMSHEET',
  'FIG-STUDIO-MOBILE-LAYERSSHEET',
  'FIG-STUDIO-MOBILE-TEXTSHEET',
  'FIG-STUDIO-MOBILE-IMAGESHEET',
  'FIG-STUDIO-MOBILE-CONFLICT',
  // Never excluded, whatever ships: no Studio capability checkpoint consumes
  // this handoff annotation, so a blanket approval still moves it and the rule
  // above still has something to catch.
  'FIG-APP3-HANDOFF-DEPENDENCY',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * One source file with its prose removed.
 *
 * Every rule below runs against this rather than the raw text. A gate that read
 * comments fires on the paragraph that honestly explains why something is
 * forbidden — the failure `APP3-B06B`, `APP3-B06C`, `APP3-S06`, `APP3-S04` and
 * `APP3-S08-C1` each recorded once, and which this checkpoint is not going to
 * record again.
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
 * breaking it, which is exactly how a second save loop would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** Only the files `APP3-S10` introduced, prose stripped. */
export function s10Code(rootDir) {
  return S10_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}

/** Every Studio source **except** the files `APP3-S10` owns. */
export function outsideS10Code(rootDir) {
  const owned = new Set(S10_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/**
 * Every customer-visible string a copy module publishes, as whole values.
 *
 * Quoted **and** templated: the sentences carrying an interpolation are template
 * literals, and a rule reading only quoted strings would miss them. Whole values
 * rather than one joined blob, because a rule about a *label* stated as a
 * substring also fires on every sentence that happens to contain it — the
 * `APP3-S08-C1` failure, not repeated here.
 */
export function publishedValues(source) {
  const stripped = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
  return [
    ...[...stripped.matchAll(/'([^'\n]*)'/g)].map((match) => match[1] ?? ''),
    ...[...stripped.matchAll(/`([^`]*)`/g)].map((match) => match[1] ?? ''),
  ];
}

/**
 * Every Studio source **except** the files `APP3-S11` owns.
 *
 * The scope the mobile ban needs once that checkpoint has opened: the ban is
 * kept, and the mobile capability's own files are the only place it may appear.
 */
export function preS11Code(rootDir) {
  const owned = new Set(S11_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}
