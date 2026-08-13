/**
 * `APP3-S04` — the files the gate reads, and how it reads them.
 *
 * Shared with the mutation tests so a case can replace exactly one file in a
 * throwaway copy of the repository and prove the rule that protects it fails.
 *
 * Read-only, cross-platform pure Node: no database, no container, no network.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FEATURE = 'apps/storefront/src/features/design-studio';

export const CANONICAL_FILES = Object.freeze({
  model: `${FEATURE}/model/studio-layers.ts`,
  copy: `${FEATURE}/model/studio-layer-copy.ts`,
  hook: `${FEATURE}/hooks/use-studio-layers.ts`,
  list: `${FEATURE}/components/studio-layers-list.tsx`,
  panel: `${FEATURE}/components/studio-layers-panel.tsx`,
  screen: `${FEATURE}/components/studio-stage-screen.tsx`,
  stage: `${FEATURE}/components/studio-stage.tsx`,
  scene: `${FEATURE}/renderer/studio-scene.ts`,
  interaction: `${FEATURE}/store/studio-interaction.store.ts`,
  document: `${FEATURE}/store/studio-document.store.ts`,
  styles: `${FEATURE}/styles/design-studio.scss`,
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  manifest: 'apps/storefront/package.json',
});

/** The three approved section-08 rows, and their exact nodes. */
export const S04_DESIGN_ROWS = Object.freeze({
  'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT': '608:3',
  'FIG-STUDIO-LAYERS-DESKTOP-REORDER': '608:68',
  'FIG-STUDIO-LAYERS-DESKTOP-EMPTY': '608:136',
});

/**
 * Rows that must stay unapproved: they belong to checkpoints after this one.
 *
 * The watermark rows left this list at `APP3-S09`, which is the checkpoint that
 * owns them — the same narrowing every other row here will get from its own
 * checkpoint, and never a relaxation of the rule.
 */
export const LATER_DESIGN_ROWS = Object.freeze([
  'FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY',
  'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED',
  // The mobile layer sheet is the same *capability* and a different checkpoint:
  // approving the desktop rows must not carry it along.
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

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * One source file with its prose removed.
 *
 * Every rule below runs against this rather than the raw text. A gate that read
 * comments would fire on the paragraph that honestly explains why something is
 * forbidden — the failure `APP3-B06B`, `APP3-B06C` and `APP3-S06` each recorded
 * once and which is not worth recording a fourth time.
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
 * breaking it, which is exactly how a second layer model or a second drawer
 * would arrive.
 */
export function featureCode(rootDir) {
  return collect(join(rootDir, FEATURE), /\.tsx?$/)
    .map((path) => readFileSync(path, 'utf8'))
    .map((text) => text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1'))
    .join('\n');
}
