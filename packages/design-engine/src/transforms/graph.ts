/**
 * The element graph and effective transforms (`IMP-D045` PO-06).
 *
 * A group defines a **real local frame**: its children's persisted `x`/`y` are
 * expressed in it, and the group's own transform maps that frame into its
 * parent. Effective transforms therefore compose **parent outermost**:
 *
 * ```text
 * Meffective(child) = Meffective(parent group) × Mlocal(child)
 * ```
 *
 * The `child × parent` order is not merely "the other one" — it would apply the
 * child's rotation to the group's translation, moving a grouped element to a
 * place neither transform describes.
 *
 * Every walk here is bounded. P01 already rejects group cycles, but this package
 * is callable directly with input P01 never saw, so a cycle must produce a typed
 * `INVALID_PARENT_CHAIN` rather than a stack overflow.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { GeometryError, composeMatrices, localMatrix } from '../geometry/matrix';
import type { Matrix2D } from '../geometry/types';
import { geometryFinding, type GeometryFinding } from '../findings/finding';

/** Depth beyond anything IMP-D044 permits (8), so a cycle cannot spin. */
const MAX_PARENT_DEPTH = 32;

/**
 * An index of a document's elements: id lookup plus the single-parent map.
 *
 * Built once and reused, because every bounds and containment call needs the
 * same two answers and rebuilding per element would make a document walk
 * quadratic.
 */
export interface ElementGraph {
  readonly byId: ReadonlyMap<string, DesignElement>;
  /** child id → its one direct group parent id. */
  readonly parentOf: ReadonlyMap<string, string>;
  readonly order: readonly DesignElement[];
}

/**
 * Indexes a document.
 *
 * A child claimed by two groups keeps its **first** parent; P01 rejects that
 * document outright, and the engine only needs the walk to stay finite and
 * deterministic when called directly with one.
 */
export function buildElementGraph(document: DesignDocument): ElementGraph {
  const byId = new Map<string, DesignElement>();
  const parentOf = new Map<string, string>();
  for (const element of document.elements) {
    if (!byId.has(element.id)) byId.set(element.id, element);
  }
  for (const element of document.elements) {
    if (element.type !== 'group') continue;
    for (const childId of element.childIds) {
      if (!parentOf.has(childId) && childId !== element.id) parentOf.set(childId, element.id);
    }
  }
  return { byId, parentOf, order: document.elements };
}

/**
 * The chain from an element up to its root, nearest parent first.
 *
 * Returns `undefined` on a cycle or an unresolvable parent so the caller can
 * emit a finding — the alternative is a walk that never ends.
 */
export function parentChain(graph: ElementGraph, elementId: string): readonly string[] | undefined {
  const chain: string[] = [];
  const seen = new Set<string>([elementId]);
  let current = graph.parentOf.get(elementId);
  while (current !== undefined) {
    if (seen.has(current) || chain.length >= MAX_PARENT_DEPTH) return undefined;
    if (!graph.byId.has(current)) return undefined;
    seen.add(current);
    chain.push(current);
    current = graph.parentOf.get(current);
  }
  return chain;
}

export interface EffectiveTransform {
  readonly matrix: Matrix2D;
  readonly element: DesignElement;
  /** Ancestor group ids, nearest first. Empty for a root element. */
  readonly ancestors: readonly string[];
}

/**
 * Resolves an element's effective transform, or a typed finding.
 *
 * The document is never touched: no child transform is rewritten, no group is
 * flattened, nothing is rebased. Rebasing is a Studio interaction that must
 * persist its result explicitly (PO-07), and doing it here would silently
 * change what a customer saved.
 */
export function resolveEffectiveTransform(
  graph: ElementGraph,
  elementId: string,
  path = '$.elements',
): EffectiveTransform | GeometryFinding {
  const element = graph.byId.get(elementId);
  if (element === undefined) {
    return geometryFinding('UNKNOWN_ELEMENT', path, 'This element is not in the document.', {
      elementId,
    });
  }
  const ancestors = parentChain(graph, elementId);
  if (ancestors === undefined) {
    return geometryFinding(
      'INVALID_PARENT_CHAIN',
      path,
      'This element has an unresolvable or cyclic group parent.',
      { elementId },
    );
  }

  try {
    // Root first, so the composition reads parent-outermost left to right.
    const chain = [...ancestors]
      .reverse()
      .map((id) => graph.byId.get(id))
      .filter((candidate): candidate is DesignElement => candidate !== undefined);
    const matrices = [...chain, element].map((node) => localMatrix(node.transform));
    return { matrix: composeMatrices(...matrices), element, ancestors };
  } catch (error: unknown) {
    const message =
      error instanceof GeometryError ? error.message : 'The element transform is not usable.';
    return geometryFinding('INVALID_GEOMETRY', path, message, { elementId });
  }
}

/** Narrows the union `resolveEffectiveTransform` returns. */
export function isGeometryFinding(
  value: EffectiveTransform | GeometryFinding,
): value is GeometryFinding {
  return 'code' in value;
}

/**
 * Every element that paints something, in document order.
 *
 * A group is excluded because PO-07 gives it no visible geometry of its own;
 * its bounds are the union of the descendants already in this list. Hidden and
 * locked elements **are** included — visibility is a display fact, and PO-08
 * says they still have geometry.
 */
export function drawableElements(graph: ElementGraph): readonly DesignElement[] {
  return graph.order.filter((element) => element.type !== 'group');
}

/** Every drawable element reachable beneath a group, in document order. */
export function drawableDescendants(
  graph: ElementGraph,
  groupId: string,
): readonly DesignElement[] {
  return graph.order.filter((element) => {
    if (element.type === 'group') return false;
    const chain = parentChain(graph, element.id);
    return chain !== undefined && chain.includes(groupId);
  });
}
