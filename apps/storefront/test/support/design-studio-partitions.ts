/**
 * The Studio source partitions the boundary suites rule against.
 *
 * Extracted from `design-studio-source.test.ts` at `APP3-S06`, when that file
 * crossed the 600-line test ceiling. It is a split by *responsibility*, not by
 * line count: this module answers "which files belong to which checkpoint, and
 * what is their code", and the suites importing it answer "what may that code
 * do". Both need the same answer to the first question, and two copies of a
 * partition is how one of them silently stops matching the other.
 *
 * Test-only support. No production file imports it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Indexed access that fails loudly when the entry is absent.
 *
 * `noUncheckedIndexedAccess` is on, and an assertion made against a silently
 * `undefined` element would be asserting nothing at all.
 */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry at index ${String(index)}`);
  return item;
}

export const SRC = join(__dirname, '..', '..', 'src');
export const FEATURE_DIR = join(SRC, 'features', 'design-studio');
export const ROUTE_DIR = join(SRC, 'app', 'san-pham', '[slug]', 'thiet-ke');
export const STYLESHEET = join(FEATURE_DIR, 'styles', 'design-studio.scss');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("never `localStorage`", "no storage key"). Matching against
 * them would make every well-documented file fail its own rule, so the checks
 * run on code only.
 */
export function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

export function collect(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

export const sources = collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));
export const routeFiles = collect(ROUTE_DIR, /\.tsx$/).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));
export const allCode = codeOnly([...sources, ...routeFiles].map((file) => file.text).join('\n'));
export const scssCode = codeOnly(readFileSync(STYLESHEET, 'utf8'));

/**
 * The files `APP3-S02` added, named exactly.
 *
 * Several rules below were written when the Studio had no stage, and they are
 * the rules that keep it having exactly one. Making them world-aware means
 * splitting the feature rather than loosening the rule: everything S01 owns
 * still may not reach a background operation, hold a store, import a document
 * authority or render an `<svg>`, and the stage may — once.
 *
 * The list is of the S02 files rather than the S01 ones on purpose. A file
 * added tomorrow is not on it, so it inherits the strict S01 rules by default;
 * a list of S01 files would have let a new file escape every one of them.
 */
export const S02_FILES = new Set(
  [
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
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S07` added, named exactly, for the same reason.
 *
 * S02's own rules — no pointer gesture, no measurement of the browser's layout —
 * were written when the stage could only draw. The viewport needs one bounded
 * use of each, so the split grows rather than the rules loosening: everything
 * outside this list still may not follow a pointer or ask the DOM how big it is.
 */
export const S07_FILES = new Set(
  [
    'components/studio-stage-controls.tsx',
    'components/studio-stage-viewport.tsx',
    'model/studio-viewport.ts',
    'model/studio-viewport-copy.ts',
    'store/studio-viewport.store.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S03` added, named exactly, for the same reason again.
 *
 * S03 is the first checkpoint that changes a document, so it needs the pointer
 * gestures S02 banned and the one element measurement S07 opened — plus the
 * single `Math.atan2` that turns a pointer into an angle. Each stays confined
 * to these files and refused in every other.
 */
export const S03_FILES = new Set(
  [
    'components/studio-transform-overlay.tsx',
    'hooks/use-studio-transform.ts',
    'model/studio-stage-mapping.ts',
    'model/studio-transform.ts',
    'model/studio-transform-authority.ts',
    'model/studio-transform-copy.ts',
    'model/studio-transform-handles.ts',
    'store/studio-document.store.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The file `APP3-S03-C1` added, named exactly, for the same reason once more.
 *
 * It is adapter-side: it restores object identity for elements the renderer has
 * already been given, so it necessarily reads the `APP3-P01` document shape and
 * the `APP3-P02` graph — both of which the S01 partition is still forbidden to
 * touch. Listing it here is what keeps that prohibition strict everywhere else
 * rather than relaxing it feature-wide. Every other rule below still applies to
 * it through `staticCode` and `allCode`: it may not follow a pointer, measure
 * the DOM, hold a store, fetch, or compose a matrix.
 */
export const S03_C1_FILES = new Set(
  ['renderer/studio-scene-identity.ts'].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S05` added, named exactly, for the same reason once more.
 *
 * The text capability is the second thing that changes a document, so every one
 * of these reads the `APP3-P01` authority — the element type, the controlled
 * font registry, the character limits, the structural validator — which the S01
 * partition is still forbidden to touch. Listing them keeps that prohibition
 * strict everywhere else instead of relaxing it feature-wide.
 *
 * Every other rule still applies to them through `staticCode` and `allCode`:
 * they may not follow a pointer, measure the DOM, compose a matrix, open a
 * second `<svg>`, reach a background operation, or name a Session secret. The
 * inspector's form controls are HTML; the artwork is still the one SVG scene.
 */
export const S05_FILES = new Set(
  [
    'components/studio-text-controls.tsx',
    'components/studio-text-drawer.tsx',
    'components/studio-text-inspector.tsx',
    'components/studio-text-panel.tsx',
    'hooks/use-controlled-font.ts',
    'hooks/use-studio-text.ts',
    'hooks/use-studio-viewport-tier.ts',
    'model/studio-font-variant.ts',
    'model/studio-responsive.ts',
    'model/studio-text-authority.ts',
    'model/studio-text-copy.ts',
    'model/studio-text-fields.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S06` added, named exactly, for the same reason once more.
 *
 * The image capability is the third thing that changes a document, so these read
 * the `APP3-P01` authority — the image element type, the contextual derivative
 * validation, the structural validator — which the S01 partition is still
 * forbidden to touch. They are also the first Studio files that legitimately
 * name a `derivativeId`, because a `APP3-P01` image element carries one.
 *
 * Every other rule still applies to them through `staticCode` and `allCode`:
 * they may not follow a pointer, measure the DOM, compose a matrix, open a
 * second `<svg>`, name a storage address or write a Session identity anywhere.
 * The one that matters most is unchanged — the artwork is still the one SVG
 * scene, drawn by the S02 element component.
 */
export const S06_FILES = new Set(
  [
    'components/studio-image-inspector.tsx',
    'components/studio-image-panel.tsx',
    'hooks/use-session-asset-status.ts',
    'hooks/use-studio-image.ts',
    'hooks/use-studio-image-media.ts',
    'model/studio-image-authority.ts',
    'model/studio-image-copy.ts',
    'model/studio-image-file.ts',
    'model/studio-image-placement.ts',
    'model/studio-inspector-copy.ts',
    'services/studio-session-asset.client.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S04` added, named exactly.
 *
 * The layer capability reads the `APP3-P01` authority — the element union, the
 * structural validator — and it is the first Studio surface that legitimately
 * carries a **drag**: the approved `608:68` frame draws drag-reorder with a drop
 * indicator, and until this checkpoint every `onDrag*` in the feature was a
 * capability a later checkpoint owned. So the ban moves rather than loosening:
 * a drag outside this list is still forbidden, and inside it is still a native
 * DOM gesture with no interaction library behind it.
 *
 * `studio-stage-status.tsx` is on the list because `APP3-S04` split it out of
 * `StudioStageScreen` to stay inside the 400-line limit. Its content is
 * `APP3-S02`/`S03`'s and unchanged; what moved is which file holds it.
 */
export const S04_FILES = new Set(
  [
    'components/studio-layers-list.tsx',
    'components/studio-layers-panel.tsx',
    'components/studio-stage-status.tsx',
    'hooks/use-studio-layers.ts',
    'model/studio-layer-copy.ts',
    'model/studio-layers.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S09` added, named exactly.
 *
 * The runtime watermark is the first thing in the feature that may legitimately
 * contain the word — every earlier checkpoint was forbidden it outright, and
 * those bans are kept and scoped rather than deleted: a watermark outside these
 * four files is still a capability arriving in the wrong checkpoint.
 */
export const S09_FILES = new Set(
  [
    'components/studio-stage-watermark.tsx',
    'hooks/use-studio-watermark-token.ts',
    'model/studio-watermark.ts',
    'model/studio-watermark-copy.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S08` added, named exactly.
 *
 * Undo and redo are the first thing in the feature that may legitimately hold a
 * past and a future. Every earlier checkpoint was forbidden the words outright,
 * and those bans are kept and scoped rather than deleted: a history stack
 * outside these files is still a capability arriving in the wrong checkpoint,
 * and the S01 partition still may not build one at all.
 *
 * `studio-stage-panels.tsx` is on the list because `APP3-S08` split it out of
 * `StudioStageScreen` to stay inside the 400-line limit. Its content is the
 * composition `APP3-S05-MI01` established and later checkpoints extended; what
 * moved is which file holds it.
 */
export const S08_FILES = new Set(
  [
    'components/studio-history-list.tsx',
    'components/studio-history-panel.tsx',
    // APP3-S08-C1 split the one panel into the surfaces the live frames draw:
    // the controls in the persistent rail, the hint in its own box. A partition
    // that still named only the old file would hand the new ones to S01, whose
    // own rules would then fail on a viewport read that is legitimately S08's.
    'components/studio-history-rail.tsx',
    'components/studio-history-shortcuts.tsx',
    'components/studio-stage-panels.tsx',
    'hooks/use-studio-history.ts',
    'hooks/use-studio-history-shortcuts.ts',
    'model/studio-history.ts',
    'model/studio-history-copy.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S10` added, named exactly.
 *
 * Autosave is the first thing in the feature that may legitimately **write** —
 * to the server, and to browser storage. Every earlier checkpoint was forbidden
 * both outright, and those bans are kept and scoped rather than deleted: an
 * autosave call or a `localStorage` write outside this list is still a
 * capability arriving in the wrong checkpoint, and the S01 partition still may
 * not interpret a Design Document at all.
 *
 * `studio-session-expired.tsx` is deliberately **not** on the list. It is
 * `APP3-S01`'s file, extended here with the second approved action and the
 * frame's own copy; it still renders no document, holds no store and calls
 * nothing, so it keeps the strict S01 rules rather than escaping them.
 */
export const S10_FILES = new Set(
  [
    'components/studio-resume-prompt.tsx',
    'components/studio-save-chip.tsx',
    'components/studio-save-state.tsx',
    'components/studio-stage-topbar.tsx',
    'hooks/use-studio-autosave.ts',
    'hooks/use-studio-resume.ts',
    'hooks/use-studio-unsaved-warning.ts',
    'model/studio-autosave.ts',
    'model/studio-autosave-copy.ts',
    'model/studio-resume-handle.ts',
    'model/studio-resume-scope.ts',
    'services/studio-autosave.client.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

/**
 * The files `APP3-S11` added, named exactly.
 *
 * Touch is the first thing in the feature allowed to drive a gesture from a
 * finger, and the mobile sheets are the first editing surfaces at 390. Every
 * earlier checkpoint was forbidden both, and those bans are kept and **scoped**
 * rather than deleted: a `pointerType === 'touch'` path or a bottom sheet
 * outside this list is still a capability arriving in the wrong checkpoint.
 *
 * Four files are deliberately **not** on the list even though `APP3-S11`
 * changed them — `studio-stage-screen.tsx`, `studio-stage-viewport.tsx`,
 * `studio-transform-overlay.tsx` and `use-studio-transform.ts`. They are S02,
 * S07 and S03 files that gained one seam each, and they keep their own
 * checkpoint's rules rather than escaping into a newer, looser set.
 */
export const S11_FILES = new Set(
  [
    'components/studio-layers-sheet.tsx',
    'components/studio-mobile-surface.tsx',
    'components/studio-mobile-toolbar.tsx',
    'components/studio-sheet.tsx',
    'components/studio-transform-sheet.tsx',
    'hooks/use-keyboard-inset.ts',
    'hooks/use-studio-mobile-sheets.ts',
    'hooks/use-studio-touch-gestures.ts',
    'model/studio-mobile-copy.ts',
    'model/studio-mobile-transform.ts',
    'model/studio-touch.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

export const s11Sources = sources.filter((file) => S11_FILES.has(file.path));
export const s11Code = codeOnly(s11Sources.map((file) => file.text).join('\n'));

/** Everything except the mobile capability, for the rules a finger must not escape. */
export const outsideS11Code = codeOnly(
  [...sources.filter((file) => !S11_FILES.has(file.path)), ...routeFiles]
    .map((file) => file.text)
    .join('\n'),
);

export const s10Sources = sources.filter((file) => S10_FILES.has(file.path));
export const s10Code = codeOnly(s10Sources.map((file) => file.text).join('\n'));

/** Everything except the autosave capability, for the rules a save must not escape. */
export const outsideS10Code = codeOnly(
  [...sources.filter((file) => !S10_FILES.has(file.path)), ...routeFiles]
    .map((file) => file.text)
    .join('\n'),
);

export const s08Code = codeOnly(
  sources
    .filter((file) => S08_FILES.has(file.path))
    .map((file) => file.text)
    .join('\n'),
);

/** Everything except the history capability, for the rules a past must not escape. */
export const outsideS08Code = codeOnly(
  [...sources.filter((file) => !S08_FILES.has(file.path)), ...routeFiles]
    .map((file) => file.text)
    .join('\n'),
);

export const s09Code = codeOnly(
  sources
    .filter((file) => S09_FILES.has(file.path))
    .map((file) => file.text)
    .join('\n'),
);

/** Everything except the watermark, for the rules a watermark must not escape. */
export const outsideS09Code = codeOnly(
  [...sources.filter((file) => !S09_FILES.has(file.path)), ...routeFiles]
    .map((file) => file.text)
    .join('\n'),
);

export const s04Code = codeOnly(
  sources
    .filter((file) => S04_FILES.has(file.path))
    .map((file) => file.text)
    .join('\n'),
);

/** Everything except the layer capability, for the rules a drag must not escape. */
export const outsideS04Code = codeOnly(
  [...sources.filter((file) => !S04_FILES.has(file.path)), ...routeFiles]
    .map((file) => file.text)
    .join('\n'),
);

/**
 * The checkpoints that own a gesture — and only those.
 *
 * `APP3-S07` owns pan and zoom, `APP3-S03` owns the element transform, and
 * `APP3-S11` owns touch. The partition grew by one checkpoint rather than the
 * ban being lifted: a `setPointerCapture` or a `clientWidth` read anywhere else
 * in the feature is still a second gesture engine, and still fails.
 */
export const interactionSources = sources.filter(
  (file) => S07_FILES.has(file.path) || S03_FILES.has(file.path) || S11_FILES.has(file.path),
);
export const interactionCode = codeOnly(interactionSources.map((file) => file.text).join('\n'));
export const staticSources = sources.filter(
  (file) => !S07_FILES.has(file.path) && !S03_FILES.has(file.path) && !S11_FILES.has(file.path),
);
export const staticCode = codeOnly(staticSources.map((file) => file.text).join('\n'));
export const s03Code = codeOnly(
  sources
    .filter((file) => S03_FILES.has(file.path))
    .map((file) => file.text)
    .join('\n'),
);

export const s01Sources = sources.filter(
  (file) =>
    !S02_FILES.has(file.path) &&
    !S07_FILES.has(file.path) &&
    !S03_FILES.has(file.path) &&
    !S03_C1_FILES.has(file.path) &&
    !S05_FILES.has(file.path) &&
    !S06_FILES.has(file.path) &&
    !S04_FILES.has(file.path) &&
    !S08_FILES.has(file.path) &&
    !S09_FILES.has(file.path) &&
    !S10_FILES.has(file.path) &&
    !S11_FILES.has(file.path),
);
export const s07Sources = sources.filter((file) => S07_FILES.has(file.path));
export const s07Code = codeOnly(s07Sources.map((file) => file.text).join('\n'));
export const s02Sources = sources.filter((file) => S02_FILES.has(file.path));
export const s01Code = codeOnly([...s01Sources, ...routeFiles].map((file) => file.text).join('\n'));
export const s02Code = codeOnly(s02Sources.map((file) => file.text).join('\n'));
