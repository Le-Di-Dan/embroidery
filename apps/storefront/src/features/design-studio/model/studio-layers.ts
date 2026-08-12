/**
 * The layer list, as a projection of the one working document (`APP3-S04`).
 *
 * ## There is no second model
 *
 * `APP3-P01` gives z-order no field: the `elements` array **is** z-order, bottom
 * first, and `visible`/`locked` are element fields. So a layer panel needs no
 * store of its own, and must not have one — a `zIndex` number, a layer array, a
 * visibility map or a lock map would each be a second answer to a question the
 * document already answers, and the two would agree only until the first refused
 * candidate. Everything below reads a `DesignDocument` and returns a candidate
 * `DesignDocument`; nothing here holds state.
 *
 * ## Which end is the front
 *
 * The array is bottom-first because SVG paints in document order and PO-07 gives
 * a group no paint of its own. A layer list reads the other way — the front-most
 * thing is at the top — so the projection is the array **reversed**, exactly as
 * the accepted Admin Template editor does it, and the panel says so in words
 * rather than leaving a customer to infer which end is which. The renderer is
 * never reversed to make the list easier: document order is the stacking, and a
 * list that disagreed with the paint would be a list about a different design.
 *
 * ## Grouping is not implemented here, and the reason is authority
 *
 * The `APP3-S04` capability row names `group`, and `IMP-D045` PO-07 says in
 * terms that "a future grouping interaction must choose the frame, rebase
 * children into it and persist that explicitly — a later Studio checkpoint".
 * Two things that checkpoint needs are absent:
 *
 * - **Which frame.** PO-07 defers the choice and PO-12 makes it a
 *   *schema-semantic* decision: the persisted box is the group's local frame and
 *   its rotation/scale pivot, so a selection-AABB frame and a document-origin
 *   frame produce different behaviour the first time anyone rotates the group,
 *   on documents already saved under `schemaVersion = 1`.
 * - **Which members.** The three approved `APP3-S04` frames are *List &
 *   Selection*, *Reordering* and *Empty*. None draws a multi-select affordance,
 *   and `APP3-S02`'s selection model is a single `selectedElementId`. There is
 *   no approved way to say which elements a group would contain.
 *
 * So grouping is reported as blocked rather than invented, and this file
 * contains no group construction, no rebase and no member selection. What it
 * does contain is honest handling of a group that already exists in a document —
 * a cloned Template may carry one — which is a different thing.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';
import type { ElementGraph } from '@embroidery/design-engine';

import { STUDIO_LAYER_COPY } from './studio-layer-copy';

/** How far a text label may run before it stops being a label. */
const LABEL_MAX_LENGTH = 32;

/** Which restack a row can still do. Both false at a boundary, or when nested. */
export interface LayerMoves {
  readonly up: boolean;
  readonly down: boolean;
}

/** One row of the panel. Derived per render; never stored. */
export interface StudioLayerRow {
  /** `APP3-P01`'s stable opaque id. The row key, and never the label. */
  readonly id: string;
  readonly type: DesignElement['type'];
  readonly label: string;
  readonly typeLabel: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly selected: boolean;
  /**
   * Whether this element is a direct member of a group.
   *
   * A nested element's place in the array is not a top-level stacking decision —
   * its parent's is — so restacking it is offered as unavailable with a reason
   * rather than silently doing something a customer did not ask for. Reordering
   * never changes parentage (`APP3-S04` §8), and this is what keeps that true
   * without needing a rule about it.
   */
  readonly nested: boolean;
  readonly moves: LayerMoves;
}

/**
 * A bounded, safe name for one layer.
 *
 * Text names itself; nothing else in `APP3-P01` carries a title, an alt text or
 * a caption, so the honest label for every other kind is the kind of thing it
 * is. The id is never a label: it is an opaque internal reference that means
 * nothing to a customer and would read as noise in a screen reader.
 *
 * Long text is cut to a length that still reads as a label. The cut is on code
 * points rather than UTF-16 units, so a Vietnamese diacritic or an emoji is
 * never split into halves that render as replacement characters.
 */
export function layerLabel(element: DesignElement): string {
  if (element.type !== 'text') return typeLabel(element);
  const trimmed = element.text.trim();
  if (trimmed === '') return STUDIO_LAYER_COPY.typeText;
  const points = [...trimmed];
  return points.length <= LABEL_MAX_LENGTH
    ? trimmed
    : `${points.slice(0, LABEL_MAX_LENGTH).join('')}…`;
}

export function typeLabel(element: DesignElement): string {
  switch (element.type) {
    case 'text':
      return STUDIO_LAYER_COPY.typeText;
    case 'image':
      return STUDIO_LAYER_COPY.typeImage;
    case 'shape':
      return STUDIO_LAYER_COPY.typeShape;
    case 'freehand':
      return STUDIO_LAYER_COPY.typeFreehand;
    default:
      return STUDIO_LAYER_COPY.typeGroup;
  }
}

/**
 * The panel's rows, front-most first.
 *
 * Every element appears, groups included: a group is a layer even though it
 * paints nothing, and omitting it would give a customer a list that cannot
 * account for what is on the stage. The list is not a tree — the approved frames
 * draw a flat list, and inventing expandable hierarchy affordances for a
 * capability whose creation half is blocked would be designing the part nobody
 * reviewed.
 */
export function layerRowsOf(
  document: DesignDocument | null,
  selectedElementId: string | null,
  graph: ElementGraph | null,
): readonly StudioLayerRow[] {
  if (document === null) return [];

  const topLevel = document.elements.filter(
    (element) => graph?.parentOf.get(element.id) === undefined,
  );
  const firstTop = topLevel[0]?.id;
  const lastTop = topLevel[topLevel.length - 1]?.id;

  const rows = document.elements.map((element): StudioLayerRow => {
    const nested = graph !== null && graph.parentOf.get(element.id) !== undefined;
    return {
      id: element.id,
      type: element.type,
      label: layerLabel(element),
      typeLabel: typeLabel(element),
      visible: element.visible,
      locked: element.locked,
      selected: element.id === selectedElementId,
      nested,
      moves: {
        // "Up" is toward the front of the stage, which is *later* in the array.
        up: !nested && element.id !== lastTop,
        down: !nested && element.id !== firstTop,
      },
    };
  });

  // Reversed once, at the end, so every index above is still an array index and
  // no rule in this file has to reason in two directions at the same time.
  return rows.reverse();
}

/** Why a restack is unavailable, or `null` when it is available. */
export function moveUnavailableReason(
  row: StudioLayerRow,
  direction: 'up' | 'down',
): string | null {
  if (row.nested) return STUDIO_LAYER_COPY.nestedReason;
  if (direction === 'up' && !row.moves.up) return STUDIO_LAYER_COPY.topReason;
  if (direction === 'down' && !row.moves.down) return STUDIO_LAYER_COPY.bottomReason;
  return null;
}

/**
 * The document with one top-level element moved to another top-level position.
 *
 * The **only** thing that changes is the order of the `elements` array. No id,
 * type, transform, visibility, lock, media field, text field or `childIds` list
 * is touched, and no element gains or loses a parent: membership is a group's
 * `childIds`, so moving an element past a group changes where it paints and
 * nothing else. That is what stops an ordinary layer drag from becoming an
 * implicit reparent.
 *
 * `null` when the move is not one this panel offers — an unknown id, a nested
 * element, or a destination that is not a top-level position. Refusing is the
 * honest answer; there is no nearest legal move to substitute.
 */
export function withElementMovedTo(
  document: DesignDocument,
  elementId: string,
  targetElementId: string,
  graph: ElementGraph | null,
): DesignDocument | null {
  if (elementId === targetElementId) return null;
  if (nestedIn(graph, elementId) || nestedIn(graph, targetElementId)) return null;

  const from = document.elements.findIndex((element) => element.id === elementId);
  const to = document.elements.findIndex((element) => element.id === targetElementId);
  if (from < 0 || to < 0) return null;

  const elements = [...document.elements];
  const [moved] = elements.splice(from, 1);
  if (moved === undefined) return null;
  elements.splice(to, 0, moved);
  return { ...document, elements };
}

/**
 * The document with one top-level element moved one place toward the front or
 * the back **of the top-level sequence**.
 *
 * Adjacent in the list, not adjacent in the array: stepping by one array index
 * would walk an element into the middle of a group's children, which is a place
 * a customer never pointed at. `null` at a boundary, so a disabled control and a
 * refused command agree.
 */
export function withElementStepped(
  document: DesignDocument,
  elementId: string,
  direction: 'up' | 'down',
  graph: ElementGraph | null,
): DesignDocument | null {
  if (nestedIn(graph, elementId)) return null;
  const topLevel = document.elements.filter((element) => !nestedIn(graph, element.id));
  const at = topLevel.findIndex((element) => element.id === elementId);
  if (at < 0) return null;

  const neighbour = topLevel[direction === 'up' ? at + 1 : at - 1];
  if (neighbour === undefined) return null;
  return withElementMovedTo(document, elementId, neighbour.id, graph);
}

/**
 * The document with one element's `visible` flag replaced.
 *
 * Hiding keeps the element, its geometry, its z-order and its media exactly as
 * they are. It is not a delete, not a move to another list and not an opacity of
 * zero — an element at `opacity: 0` is still painted, still hit-testable and
 * still counts against every budget, so substituting one for the other would be
 * a different design that merely looks the same.
 */
export function withElementVisible(
  document: DesignDocument,
  elementId: string,
  visible: boolean,
): DesignDocument | null {
  return withFlag(document, elementId, (element) =>
    element.visible === visible ? null : { ...element, visible },
  );
}

/**
 * The document with one element's `locked` flag replaced.
 *
 * `APP3-P01`'s `locked` is the whole lock model. The accepted Studio already
 * reads it — `APP3-S03` refuses a transform on a locked element, `APP3-S05`
 * refuses a text edit and `APP3-S06` refuses a replacement — so this checkpoint
 * supplies the control and adds no second authority. In particular the lock is
 * never `pointer-events: none`: a CSS rule stops a mouse and stops nothing else,
 * leaving the keyboard, the inspector and every programmatic path open.
 *
 * A locked group is not rewritten into its children. `childIds` is a
 * relationship and the accepted editors already resolve ancestors through
 * `APP3-P02`; copying a parent's flag onto every child would be a second, divergent
 * record of the same fact and would survive an ungroup that never happened.
 */
export function withElementLocked(
  document: DesignDocument,
  elementId: string,
  locked: boolean,
): DesignDocument | null {
  return withFlag(document, elementId, (element) =>
    element.locked === locked ? null : { ...element, locked },
  );
}

function withFlag(
  document: DesignDocument,
  elementId: string,
  change: (element: DesignElement) => DesignElement | null,
): DesignDocument | null {
  const current = document.elements.find((element) => element.id === elementId);
  if (current === undefined) return null;
  const next = change(current);
  if (next === null) return null;
  return {
    ...document,
    elements: document.elements.map((element) => (element.id === elementId ? next : element)),
  };
}

function nestedIn(graph: ElementGraph | null, elementId: string): boolean {
  return graph !== null && graph.parentOf.get(elementId) !== undefined;
}
