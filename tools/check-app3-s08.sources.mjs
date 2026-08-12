/**
 * `APP3-S08` — the files the gate reads, and how it reads them.
 *
 * Shared with the mutation tests so a case can replace exactly one file in a
 * throwaway copy of the repository and prove the rule that protects it fails.
 *
 * Read-only, cross-platform pure Node: no database, no container, no network.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FEATURE = 'apps/storefront/src/features/design-studio';

export const CANONICAL_FILES = Object.freeze({
  model: `${FEATURE}/model/studio-history.ts`,
  copy: `${FEATURE}/model/studio-history-copy.ts`,
  hook: `${FEATURE}/hooks/use-studio-history.ts`,
  shortcuts: `${FEATURE}/hooks/use-studio-history-shortcuts.ts`,
  list: `${FEATURE}/components/studio-history-list.tsx`,
  panel: `${FEATURE}/components/studio-history-panel.tsx`,
  panels: `${FEATURE}/components/studio-stage-panels.tsx`,
  store: `${FEATURE}/store/studio-document.store.ts`,
  transform: `${FEATURE}/hooks/use-studio-transform.ts`,
  text: `${FEATURE}/hooks/use-studio-text.ts`,
  layers: `${FEATURE}/hooks/use-studio-layers.ts`,
  image: `${FEATURE}/hooks/use-studio-image.ts`,
  controls: `${FEATURE}/components/studio-text-controls.tsx`,
  screen: `${FEATURE}/components/studio-stage-screen.tsx`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  manifest: 'apps/storefront/package.json',
  elements: 'packages/design-document/src/schema/elements.ts',
  document: 'packages/design-document/src/schema/document.ts',
});

/** The two approved section-12 rows, and their exact nodes. */
export const S08_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY': '609:147',
  'FIG-STUDIO-UNDO-DESKTOP-DISABLED': '609:209',
});

/** Rows that must stay unapproved: they belong to checkpoints after this one. */
export const LATER_DESIGN_ROWS = Object.freeze([
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-LAYERSSHEET',
]);

/**
 * The seven files the history capability lives in, relative to the feature.
 *
 * The one working-document store is deliberately **not** on this list and
 * deliberately allowed to hold the past and the future: `APP3-S08` §5 requires
 * them beside the one current document rather than in a controller with a
 * current of its own. Everything that *builds* or *projects* a history is here.
 */
export const S08_FILES = Object.freeze([
  'components/studio-history-list.tsx',
  'components/studio-history-panel.tsx',
  'components/studio-stage-panels.tsx',
  'hooks/use-studio-history.ts',
  'hooks/use-studio-history-shortcuts.ts',
  'model/studio-history.ts',
  'model/studio-history-copy.ts',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * One source file with its prose removed.
 *
 * Every rule below runs against this rather than the raw text. A gate that read
 * comments would fire on the paragraph that honestly explains why something is
 * forbidden — the failure `APP3-B06B`, `APP3-B06C`, `APP3-S06`, `APP3-S04` and
 * `APP3-S09` each recorded once, and which this checkpoint is not going to
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
 * breaking it, which is exactly how a second history stack or a persisted past
 * would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => readFileSync(path, 'utf8'))
    .map((text) => text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1'))
    .join('\n');
}

/** Every Studio source **except** the history files and the one document store. */
export function outsideS08Code(rootDir) {
  const owned = new Set([
    ...S08_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))),
    join(rootDir, FEATURE, 'store', 'studio-document.store.ts'),
  ]);
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}

/** The history files' own code, prose stripped. */
export function s08Code(rootDir) {
  return S08_FILES.map((path) => code(rootDir, `${FEATURE}/${path}`)).join('\n');
}
