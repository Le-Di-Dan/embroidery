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
 *
 * The same reasoning governs **ambiguous parentage** (`APP3-P02-C1`). The
 * structural contract gives an element at most one direct group parent, so two
 * groups claiming one child is not a graph with an awkward answer — it is a graph
 * with **no** authoritative effective transform. Selecting one claim by document
 * order would make a customer's geometry depend on which group happened to be
 * serialized first, silently accept input that bypassed validation upstream, and
 * hand back an AABB that looks authoritative while describing a placement nobody
 * chose. The correct result is refusal, so ambiguity is detected while indexing
 * and no parent map is exposed at all.
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
  /** child id → its one direct group parent id. Empty when the graph is invalid. */
  readonly parentOf: ReadonlyMap<string, string>;
  readonly order: readonly DesignElement[];
  /**
   * Structural ambiguity found while indexing.
   *
   * Non-empty means there is no usable effective-transform graph: `parentOf` is
   * empty rather than partial, so no caller can accidentally resolve geometry
   * from the claims that happened to be unambiguous.
   */
  readonly structuralFindings: readonly GeometryFinding[];
}

/** Every parent claim a document makes, before any of it is trusted. */
interface ParentClaims {
  /** child id → the distinct groups claiming it. */
  readonly claims: ReadonlyMap<string, ReadonlySet<string>>;
  /** children listed more than once inside one group. */
  readonly repeated: ReadonlySet<string>;
  /** groups listing themselves. */
  readonly selfClaiming: ReadonlySet<string>;
  /** claimed children that are not in the document. */
  readonly unknown: ReadonlySet<string>;
}

function collectParentClaims(
  document: DesignDocument,
  byId: ReadonlyMap<string, DesignElement>,
): ParentClaims {
  const claims = new Map<string, Set<string>>();
  const repeated = new Set<string>();
  const selfClaiming = new Set<string>();
  const unknown = new Set<string>();

  for (const element of document.elements) {
    if (element.type !== 'group') continue;
    const listedHere = new Set<string>();
    for (const childId of element.childIds) {
      if (childId === element.id) {
        selfClaiming.add(element.id);
        continue;
      }
      if (listedHere.has(childId)) {
        repeated.add(childId);
        continue;
      }
      listedHere.add(childId);
      if (!byId.has(childId)) {
        unknown.add(childId);
        continue;
      }
      const claiming = claims.get(childId) ?? new Set<string>();
      claiming.add(element.id);
      claims.set(childId, claiming);
    }
  }
  return { claims, repeated, selfClaiming, unknown };
}

/**
 * Findings for every structural ambiguity, in an order the document decides.
 *
 * Known ids are reported in element order and unknown ones alphabetically, so
 * moving a group within the document changes neither the codes nor their
 * sequence. An ambiguity whose report depended on group order would be one more
 * way for geometry to depend on serialization.
 */
function collectStructuralFindings(
  document: DesignDocument,
  collected: ParentClaims,
): readonly GeometryFinding[] {
  const findings: GeometryFinding[] = [];
  const invalid = (elementId: string, message: string, meta?: Record<string, number>) =>
    findings.push(
      geometryFinding('INVALID_PARENT_CHAIN', '$.elements', message, {
        elementId,
        ...(meta === undefined ? {} : { meta }),
      }),
    );

  for (const element of document.elements) {
    if (collected.selfClaiming.has(element.id)) {
      invalid(element.id, 'This group lists itself as one of its own children.');
    }
    if (collected.repeated.has(element.id)) {
      invalid(element.id, 'This element is listed more than once inside one group.');
    }
    const claiming = collected.claims.get(element.id);
    if (claiming !== undefined && claiming.size > 1) {
      invalid(element.id, 'This element is claimed as a child by more than one group.', {
        parentClaimCount: claiming.size,
      });
    }
  }
  for (const childId of [...collected.unknown].sort()) {
    findings.push(
      geometryFinding(
        'UNKNOWN_ELEMENT',
        '$.elements',
        'A group lists a child that is not in the document.',
        {
          elementId: childId,
        },
      ),
    );
  }
  return findings;
}

/**
 * Indexes a document, or reports why it cannot be indexed.
 *
 * Claims are staged and only become a parent map once every one of them is known
 * to be unambiguous. Nothing is repaired on the way: a claim is never dropped, a
 * `childIds` list is never rewritten, and no group order, id order or z-order
 * decides between two claims.
 */
export function buildElementGraph(document: DesignDocument): ElementGraph {
  const byId = new Map<string, DesignElement>();
  for (const element of document.elements) {
    if (!byId.has(element.id)) byId.set(element.id, element);
  }

  const collected = collectParentClaims(document, byId);
  const structuralFindings = collectStructuralFindings(document, collected);

  const parentOf = new Map<string, string>();
  if (structuralFindings.length === 0) {
    for (const [childId, claiming] of collected.claims) {
      const [onlyParent] = claiming;
      if (claiming.size === 1 && onlyParent !== undefined) parentOf.set(childId, onlyParent);
    }
  }
  return { byId, parentOf, order: document.elements, structuralFindings };
}

/**
 * The finding that blocks this graph, preferring the one that names `elementId`.
 *
 * `undefined` means the graph is structurally sound — it says nothing about the
 * geometry of any particular element.
 */
export function structuralFinding(
  graph: ElementGraph,
  elementId?: string,
): GeometryFinding | undefined {
  if (graph.structuralFindings.length === 0) return undefined;
  const named = graph.structuralFindings.find((finding) => finding.elementId === elementId);
  return named ?? graph.structuralFindings[0];
}

/**
 * The chain from an element up to its root, nearest parent first.
 *
 * Returns `undefined` on a cycle, an unresolvable parent or an ambiguous graph,
 * so the caller can emit a finding — the alternative is a walk that never ends,
 * or one that ends at a parent nothing chose.
 */
export function parentChain(graph: ElementGraph, elementId: string): readonly string[] | undefined {
  if (graph.structuralFindings.length > 0) return undefined;
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
  // An ambiguous graph has no authoritative transform for any element, not just
  // for the contested child: the contested child may be an ancestor of anything.
  const structural = structuralFinding(graph, elementId);
  if (structural !== undefined) return structural;

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
