/**
 * The canonical Template SVG representation (`IMP-D047` PO-12, PO-13).
 *
 * A plain immutable tree of names, canonical attribute values and children —
 * deliberately *not* a DOM. The structural comparison in step 6 has to answer
 * "did the sanitizer change anything?", and comparing two live DOM trees would
 * be comparing two objects that carry parent pointers, owner documents,
 * namespace bookkeeping and live node lists. This model carries only what the
 * policy admits, so equality here means exactly what the ruling says it means.
 *
 * The DOM shapes below are structural, not jsdom's: the domain layer states what
 * it needs from a node and stays free of the parser that supplies it.
 */
import type { SvgViewBox } from './svg-attribute-values';

export const DOM_ELEMENT_NODE = 1;
export const DOM_TEXT_NODE = 3;

export interface SvgDomAttribute {
  readonly name: string;
  readonly namespaceURI: string | null;
  readonly value: string;
}

export interface SvgDomNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
}

export interface SvgDomElement extends SvgDomNode {
  readonly localName: string;
  readonly namespaceURI: string | null;
  readonly attributes: ArrayLike<SvgDomAttribute>;
  readonly childNodes: ArrayLike<SvgDomNode>;
}

export interface CanonicalAttribute {
  readonly name: string;
  readonly value: string;
}

export interface CanonicalElement {
  readonly name: string;
  /** Already canonical and already in the locked serialization order (PO-13). */
  readonly attributes: readonly CanonicalAttribute[];
  readonly children: readonly CanonicalElement[];
}

export interface CanonicalSvgDocument {
  readonly root: CanonicalElement;
  /** The sole source of the derivative's `width_px` and `height_px` (PO-10). */
  readonly viewBox: SvgViewBox;
  readonly elementCount: number;
  readonly pathDataChars: number;
  readonly maxDepth: number;
}

/**
 * Deep structural equality between two canonical trees.
 *
 * Written out rather than done by comparing serialized strings: a serializer bug
 * that dropped the same thing on both sides would make two different documents
 * compare equal, and step 6 would then be checking the serializer against
 * itself. Comparing the trees keeps the two checks independent.
 */
export function canonicalElementsEqual(left: CanonicalElement, right: CanonicalElement): boolean {
  if (left.name !== right.name) return false;
  if (left.attributes.length !== right.attributes.length) return false;
  if (left.children.length !== right.children.length) return false;

  for (const [index, attribute] of left.attributes.entries()) {
    const other = right.attributes[index];
    if (other === undefined) return false;
    if (attribute.name !== other.name || attribute.value !== other.value) return false;
  }

  for (const [index, child] of left.children.entries()) {
    const other = right.children[index];
    if (other === undefined) return false;
    if (!canonicalElementsEqual(child, other)) return false;
  }

  return true;
}

/** Documents are equal when their trees and their derived geometry both are. */
export function canonicalDocumentsEqual(
  left: CanonicalSvgDocument,
  right: CanonicalSvgDocument,
): boolean {
  return (
    left.viewBox.minX === right.viewBox.minX &&
    left.viewBox.minY === right.viewBox.minY &&
    left.viewBox.width === right.viewBox.width &&
    left.viewBox.height === right.viewBox.height &&
    left.elementCount === right.elementCount &&
    left.pathDataChars === right.pathDataChars &&
    canonicalElementsEqual(left.root, right.root)
  );
}
