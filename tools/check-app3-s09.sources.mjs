/**
 * `APP3-S09` — the files the gate reads, and how it reads them.
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
  watermark: `${FEATURE}/components/studio-stage-watermark.tsx`,
  model: `${FEATURE}/model/studio-watermark.ts`,
  copy: `${FEATURE}/model/studio-watermark-copy.ts`,
  hook: `${FEATURE}/hooks/use-studio-watermark-token.ts`,
  viewport: `${FEATURE}/components/studio-stage-viewport.tsx`,
  screen: `${FEATURE}/components/studio-stage-screen.tsx`,
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  manifest: 'apps/storefront/package.json',
  elements: 'packages/design-document/src/schema/elements.ts',
  document: 'packages/design-document/src/schema/document.ts',
});

/** The four approved section-13 rows, and their exact nodes. */
export const S09_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT': '609:263',
  'FIG-STUDIO-WATERMARK-DESKTOP-DARK': '609:299',
  'FIG-STUDIO-WATERMARK-MOBILE-DEFAULT': '609:335',
  'FIG-STUDIO-WATERMARK-POLICY': '609:371',
});

/** Rows that must stay unapproved: they belong to checkpoints after this one. */
export const LATER_DESIGN_ROWS = Object.freeze([
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  'FIG-STUDIO-MOBILE-LAYERSSHEET',
  /*
   * The row that keeps this rule from emptying itself (`APP3-S11`).
   *
   * Every *capability* row above now belongs to a checkpoint that has opened, so
   * a world-aware exclusion would leave the list empty — the failure `APP3-S04`
   * recorded once already, where a rule still ran, still passed, and asserted
   * nothing. This is a handoff annotation: no Studio capability checkpoint
   * consumes it, so it must stay `REVIEW_REQUIRED` for all of them, and a
   * blanket approval still moves it.
   */
  'FIG-APP3-HANDOFF-DEPENDENCY',
]);

/** The four files the watermark may live in, relative to the feature. */
export const S09_FILES = Object.freeze([
  'components/studio-stage-watermark.tsx',
  'hooks/use-studio-watermark-token.ts',
  'model/studio-watermark.ts',
  'model/studio-watermark-copy.ts',
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
 * forbidden — the failure `APP3-B06B`, `APP3-B06C`, `APP3-S06` and `APP3-S04`
 * each recorded once, and which this checkpoint is not going to record again.
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
 * breaking it, which is exactly how a second watermark or an export control
 * would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => readFileSync(path, 'utf8'))
    .map((text) => text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1'))
    .join('\n');
}

/** Every Studio source **except** the four files the watermark owns. */
export function outsideS09Code(rootDir) {
  const owned = new Set(S09_FILES.map((path) => join(rootDir, FEATURE, ...path.split('/'))));
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .filter((path) => !owned.has(path))
    .map((path) => code(rootDir, relative(rootDir, path).replaceAll('\\', '/')))
    .join('\n');
}
