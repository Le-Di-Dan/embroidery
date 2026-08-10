/**
 * Structural sharing for the working document and its scene (`APP3-S03-C1`).
 *
 * ## The problem this exists to solve
 *
 * A transform gesture replaces the whole working document once per frame. That
 * is correct — `APP3-P01` validation and quantization are whole-document
 * operations and `IMP-D045` PO-09 rules on the *quantized* document — but it
 * produces a brand-new object for every element, including the ninety-nine the
 * customer is not dragging. Every one of them then reached the renderer as a
 * changed value, so a hundred-element scene re-rendered a hundred SVG subtrees
 * to redraw one.
 *
 * The measured cost is entirely in that React work, not in the geometry: on this
 * machine `APP3-P02` resolves transforms and stroke-aware bounds for a hundred
 * elements in ~0.13 ms and P01 validates and quantizes in ~0.08 ms, against a
 * WebKit resize frame that reached 30 ms.
 *
 * ## What it does
 *
 * Nothing but restore identity that was never semantically lost. An element
 * whose value did not change is represented by the object that already
 * represented it. Callers may then compare with `===` and skip work — which is
 * the only reason any of this exists.
 *
 * This is deliberately *not* a second document. It never edits a value, never
 * merges two documents, never keeps a document the authorities have not seen and
 * never survives a frame in which validation failed. Given two deep-equal
 * values, which instance is returned cannot be observed by any rule; given two
 * values that differ anywhere, the new one is returned untouched.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';
import type { ElementGraph } from '@embroidery/design-engine';

/**
 * Structural equality over the JSON values a Design Document is closed over.
 *
 * `APP3-P01` defines a document as JSON scalars, arrays and plain objects, so
 * this comparison is total over what can actually be in one — no `Date`, `Map`,
 * class instance or function can reach it. `NaN` compares unequal to itself and
 * therefore reads as *changed*, which is the safe direction: it costs a
 * recompute, never a stale reuse. (P01 refuses non-finite numbers anyway.)
 */
function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (left === null || right === null) return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  if (leftIsArray) {
    const a = left as readonly unknown[];
    const b = right as readonly unknown[];
    return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
  }

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]));
}

/**
 * `next`, with every element that did not change represented by the instance
 * that represented it in `previous`.
 *
 * The returned document is value-identical to `next` in every case. When
 * *nothing* changed, `previous` itself is returned, so a no-op frame is
 * detectable with one reference comparison.
 *
 * Placement is all-or-nothing on purpose. It cannot change during a transform
 * gesture, and if it ever does — a different canvas — the honest answer is to
 * rebuild rather than to reason about which derived values a canvas change can
 * reach.
 */
export function shareDocumentIdentity(
  previous: DesignDocument | null | undefined,
  next: DesignDocument,
): DesignDocument {
  if (previous === null || previous === undefined) return next;
  if (previous === next) return next;
  if (previous.schemaVersion !== next.schemaVersion) return next;
  if (!jsonEqual(previous.placement, next.placement)) return next;

  const before = new Map(previous.elements.map((element) => [element.id, element]));
  let identical = previous.elements.length === next.elements.length;

  const elements: DesignElement[] = next.elements.map((element, index) => {
    const candidate = before.get(element.id);
    if (candidate === undefined || !jsonEqual(candidate, element)) {
      identical = false;
      return element;
    }
    // Reused, but a reorder is still a change: paint order is z-order.
    if (previous.elements[index] !== candidate) identical = false;
    return candidate;
  });

  if (identical) return previous;
  return { schemaVersion: next.schemaVersion, placement: previous.placement, elements };
}

/**
 * The ids whose *placed* geometry cannot have changed.
 *
 * An element qualifies only when its own instance is shared with `previous`
 * **and** every ancestor's is. Identity by id alone would be wrong in exactly
 * the case that matters: `APP3-P02` composes ancestors outermost-first, so
 * moving a group leaves every descendant's own record untouched while changing
 * where all of them land. Reusing on id would then paint a group's children at
 * the group's old position.
 *
 * Both documents must already have been through `shareDocumentIdentity`;
 * without it every instance differs and this correctly returns nothing.
 */
export function unchangedElementIds(
  previous: DesignDocument | null | undefined,
  next: DesignDocument,
  graph: ElementGraph,
): ReadonlySet<string> {
  const unchanged = new Set<string>();
  if (previous === null || previous === undefined) return unchanged;
  if (previous.placement !== next.placement && !jsonEqual(previous.placement, next.placement)) {
    return unchanged;
  }

  const before = new Map(previous.elements.map((element) => [element.id, element]));
  const after = new Map(next.elements.map((element) => [element.id, element]));
  const decided = new Map<string, boolean>();

  const stable = (id: string): boolean => {
    const cached = decided.get(id);
    if (cached !== undefined) return cached;
    // Pre-seeded false so a malformed cycle terminates as "changed" rather than
    // recursing. `APP3-P01` refuses cyclic groups; this never trusts that.
    decided.set(id, false);

    const element = after.get(id);
    if (element === undefined || before.get(id) !== element) return false;

    const parent = graph.parentOf.get(id);
    const result = parent === undefined || stable(parent);
    decided.set(id, result);
    return result;
  };

  for (const element of next.elements) {
    if (stable(element.id)) unchanged.add(element.id);
  }
  return unchanged;
}
