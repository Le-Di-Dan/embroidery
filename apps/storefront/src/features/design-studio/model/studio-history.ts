/**
 * Local undo / redo history, as document snapshots (`APP3-S08`).
 *
 * ## Domain snapshots, never an engine stack
 *
 * `ADR-APP0-001` §6 and `IMP-D026` both say it in the same words: "undo/redo is
 * a domain command/snapshot concern, never an engine history stack". So an entry
 * holds two `APP3-P01` documents and a bounded label, and nothing else. There is
 * no DOM node, no `SVGElement`, no `APP3-P02` graph, no `Blob`, no object URL,
 * no query result, no upload progress, no Session credential, no selection, no
 * zoom, no pan and no watermark token in here — and the type makes each of those
 * unrepresentable rather than merely absent, because a `DesignDocument` is
 * closed over JSON scalars by construction.
 *
 * ## Why both ends of every entry
 *
 * An entry carries the document *before* the action and the document *after* it.
 * Undo restores `before`, redo restores `after`, and neither recomputes anything
 * — an undo that replayed an inverse operation would have to be able to invert
 * every mutation exactly, and the first one it got subtly wrong would corrupt a
 * design rather than fail. Storing both ends costs two references: consecutive
 * entries share the document between them, so a run of *n* actions holds *n + 1*
 * distinct documents, not *2n*.
 *
 * ## Bounded, and the bound is stated
 *
 * Nothing in the accepted authority fixes a number, so `MAX_HISTORY_ENTRIES` is
 * an in-memory engineering limit rather than a public business contract: it caps
 * what one browser tab retains and appears in no API, no document field and no
 * database column. `APP3-D01`'s directive for this section forbids implying an
 * unlimited history, which is why the panel states the number rather than
 * leaving a customer to discover it when the oldest entry disappears.
 *
 * ## Nothing here is persisted
 *
 * No `localStorage`, `sessionStorage`, `IndexedDB`, cookie or URL parameter, and
 * no autosave. History is local to one Studio runtime and one Session; a reload
 * starts from the persisted Session document with nothing to undo. `APP3-S10`
 * owns persistence and resume, and a history that quietly survived a reload
 * would be a save nobody reviewed.
 */
import { canonicalizeDesignDocument, type DesignDocument } from '@embroidery/design-document';

import { STUDIO_HISTORY_COPY } from './studio-history-copy';

/**
 * How many actions one Studio runtime retains.
 *
 * An engineering limit, not a business rule. When it is reached the oldest entry
 * is discarded, so the most recent work is what stays reachable.
 */
export const MAX_HISTORY_ENTRIES = 50;

/**
 * Every meaningful customer action that may become one history entry.
 *
 * A closed set on purpose: a new kind cannot be added without deciding what it
 * is called, and a kind with no label is how a raw identifier reaches a screen.
 */
export type StudioHistoryActionKind =
  | 'move'
  | 'resize'
  | 'rotate'
  | 'reorder'
  | 'lock'
  | 'unlock'
  | 'hide'
  | 'show'
  | 'text-edit'
  | 'text-format'
  | 'image-place'
  | 'image-replace';

export interface StudioHistoryAction {
  readonly kind: StudioHistoryActionKind;
  /**
   * The layer's own name, already bounded by `layerLabel`, or `null`.
   *
   * Never an element id, an `assetId` or a `derivativeId` — the layer panel
   * bounds and sanitizes this string for exactly the same reason, and this
   * reuses that answer rather than deriving a second one.
   */
  readonly label: string | null;
}

export interface StudioHistoryEntry {
  /** Monotonic within one runtime. A stable React key that eviction cannot reuse. */
  readonly seq: number;
  readonly action: StudioHistoryAction;
  readonly before: DesignDocument;
  readonly after: DesignDocument;
}

/** One row of the panel. Derived per render; never stored. */
export interface StudioHistoryRow {
  readonly key: string;
  readonly label: string;
  /** Whether this action is currently part of the design, or has been undone. */
  readonly applied: boolean;
}

export interface StudioHistoryState {
  readonly entries: readonly StudioHistoryEntry[];
  /** How many entries are applied. `entries[cursor - 1]` produced the current document. */
  readonly cursor: number;
}

export const EMPTY_HISTORY: StudioHistoryState = Object.freeze({
  entries: Object.freeze([]),
  cursor: 0,
});

export function canUndo(history: StudioHistoryState): boolean {
  return history.cursor > 0;
}

export function canRedo(history: StudioHistoryState): boolean {
  return history.cursor < history.entries.length;
}

/**
 * Whether two documents are the same design.
 *
 * Reference equality first, which is the answer in the overwhelmingly common
 * case: a gesture that refused every frame never committed, so the working
 * document is the object the gesture began with. Only when something did commit
 * does this fall through to `APP3-P01`'s own canonical form — the authority's
 * answer to "are these the same document", key-order independent and already
 * defined, rather than a second structural comparison written here that could
 * disagree with it.
 *
 * It runs at a gesture boundary, never on a pointer frame.
 *
 * A document neither form can canonicalize is reported as *changed*. The failure
 * is then a redundant history entry, which is recoverable; the opposite default
 * would silently drop an edit the customer made.
 */
export function sameDocument(left: DesignDocument, right: DesignDocument): boolean {
  if (left === right) return true;
  try {
    return canonicalizeDesignDocument(left) === canonicalizeDesignDocument(right);
  } catch {
    return false;
  }
}

/**
 * Appends one action, discarding whatever could have been redone.
 *
 * A new forward mutation is a new branch: the future the customer had undone is
 * no longer reachable from the design they now have, and keeping it would offer
 * a redo that reinstates a document their latest edit was never applied to.
 */
export function recordAction(
  history: StudioHistoryState,
  entry: StudioHistoryEntry,
): StudioHistoryState {
  const kept = [...history.entries.slice(0, history.cursor), entry];
  // The oldest goes, so the most recent work is what stays reachable.
  const overflow = kept.length - MAX_HISTORY_ENTRIES;
  const entries = overflow > 0 ? kept.slice(overflow) : kept;
  return { entries, cursor: entries.length };
}

/** The document one undo lands on, or `null` when there is nothing to undo. */
export function undoTarget(history: StudioHistoryState): StudioHistoryEntry | null {
  return canUndo(history) ? (history.entries[history.cursor - 1] ?? null) : null;
}

/** The document one redo lands on, or `null` when there is nothing to redo. */
export function redoTarget(history: StudioHistoryState): StudioHistoryEntry | null {
  return canRedo(history) ? (history.entries[history.cursor] ?? null) : null;
}

/**
 * The panel's rows, newest first.
 *
 * The list reads the way the customer thinks about it — the thing they just did
 * is at the top — while the array underneath stays oldest-first, because that is
 * the order the cursor indexes. Reversing once here is the whole difference, and
 * the cursor is never reversed to make the list easier.
 */
export function historyRowsOf(history: StudioHistoryState): readonly StudioHistoryRow[] {
  return history.entries
    .map((entry, index) => ({
      key: String(entry.seq),
      label: historyLabel(entry.action),
      applied: index < history.cursor,
    }))
    .reverse();
}

/** What one action is called, in the customer's terms. Never an identifier. */
export function historyLabel(action: StudioHistoryAction): string {
  const label = action.label;
  if (action.kind === 'image-place') return STUDIO_HISTORY_COPY.actionImagePlace;
  if (label === null || label === '') return STUDIO_HISTORY_COPY.actionFallback;

  switch (action.kind) {
    case 'move':
      return STUDIO_HISTORY_COPY.actionMove(label);
    case 'resize':
      return STUDIO_HISTORY_COPY.actionResize(label);
    case 'rotate':
      return STUDIO_HISTORY_COPY.actionRotate(label);
    case 'reorder':
      return STUDIO_HISTORY_COPY.actionReorder(label);
    case 'lock':
      return STUDIO_HISTORY_COPY.actionLock(label);
    case 'unlock':
      return STUDIO_HISTORY_COPY.actionUnlock(label);
    case 'hide':
      return STUDIO_HISTORY_COPY.actionHide(label);
    case 'show':
      return STUDIO_HISTORY_COPY.actionShow(label);
    case 'text-edit':
      return STUDIO_HISTORY_COPY.actionTextEdit(label);
    case 'text-format':
      return STUDIO_HISTORY_COPY.actionTextFormat(label);
    case 'image-replace':
      return STUDIO_HISTORY_COPY.actionImageReplace(label);
    default:
      return STUDIO_HISTORY_COPY.actionFallback;
  }
}
