/**
 * DOM → validated canonical document (`IMP-D047` PO-04, PO-06…PO-11).
 *
 * This is the single place the closed policy is *applied*. It runs twice per
 * pass — once on the parsed source and once on whatever DOMPurify returned — and
 * both runs use the same code, so "did the sanitizer change anything?" is asked
 * of two objects that were built by identical rules. A second, laxer builder for
 * the post-sanitize side would have made the comparison meaningless.
 *
 * Every failure returns `undefined`. The caller turns that into the one stable
 * outcome `UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG`: which rule refused is not told to
 * anyone, because a precise reason is a probe for what the allowlist contains.
 */
import {
  canonicalizeAttributeValue,
  formatSvgViewBox,
  parseSvgViewBox,
  type SvgViewBox,
} from './svg-attribute-values';
import {
  DOM_ELEMENT_NODE,
  DOM_TEXT_NODE,
  type CanonicalAttribute,
  type CanonicalElement,
  type CanonicalSvgDocument,
  type SvgDomAttribute,
  type SvgDomElement,
  type SvgDomNode,
} from './svg-document';
import {
  allowedAttributesFor,
  isTemplateSvgElementName,
  SVG_NAMESPACE,
  TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS,
  TEMPLATE_SVG_LIMITS,
  XMLNS_NAMESPACE,
  type TemplateSvgElementName,
} from './template-svg-policy';

const ROOT_ELEMENT = 'svg';
const VIEW_BOX = 'viewBox';
const XMLNS = 'xmlns';

interface BuildState {
  elementCount: number;
  pathDataChars: number;
  maxDepth: number;
  viewBox: SvgViewBox | undefined;
}

function isElement(node: SvgDomNode): node is SvgDomElement {
  return node.nodeType === DOM_ELEMENT_NODE;
}

/**
 * Root attributes are the closed pair, and `xmlns` is synthesized rather than
 * copied.
 *
 * DOMPurify returns the sanitized `<svg>` inside a namespaced container, so the
 * namespace *declaration* has moved even though the element's namespace has not.
 * Reading the namespace from `namespaceURI` and re-emitting one canonical
 * `xmlns` makes the two sides comparable without weakening anything: a source
 * whose root is not in the SVG namespace still fails, because `namespaceURI` is
 * what is checked.
 */
function buildRootAttributes(element: SvgDomElement): readonly CanonicalAttribute[] | undefined {
  let viewBox: string | undefined;

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes[index] as SvgDomAttribute;
    if (attribute.name === XMLNS && attribute.namespaceURI === XMLNS_NAMESPACE) {
      if (attribute.value !== SVG_NAMESPACE) return undefined;
      continue;
    }
    if (attribute.name !== VIEW_BOX || attribute.namespaceURI !== null) return undefined;
    if (viewBox !== undefined) return undefined;
    viewBox = attribute.value;
  }

  if (viewBox === undefined) return undefined;
  const parsed = parseSvgViewBox(viewBox);
  if (parsed === undefined) return undefined;
  const canonical = formatSvgViewBox(parsed);
  if (canonical === undefined) return undefined;

  return [
    { name: XMLNS, value: SVG_NAMESPACE },
    { name: VIEW_BOX, value: canonical },
  ];
}

function buildChildAttributes(
  element: SvgDomElement,
  name: TemplateSvgElementName,
): readonly CanonicalAttribute[] | undefined {
  const allowed = allowedAttributesFor(name);
  const attributes: CanonicalAttribute[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes[index] as SvgDomAttribute;
    // A namespaced attribute is rejected outright: that one check covers
    // `xlink:href`, `xml:space`, `xml:base` and every `xmlns:*` redeclaration
    // without needing a list of the names they can be spelled with.
    if (attribute.namespaceURI !== null) return undefined;
    if (!allowed.includes(attribute.name) || seen.has(attribute.name)) return undefined;

    const value = canonicalizeAttributeValue(attribute.name, attribute.value);
    if (value === undefined) return undefined;

    seen.add(attribute.name);
    attributes.push({ name: attribute.name, value });
  }

  // Lexicographic, so two sources that listed the same attributes in different
  // orders produce the same bytes (PO-13).
  return attributes.sort((left, right) => (left.name < right.name ? -1 : 1));
}

function buildElement(
  element: SvgDomElement,
  depth: number,
  state: BuildState,
): CanonicalElement | undefined {
  if (depth > TEMPLATE_SVG_LIMITS.maxDepth) return undefined;
  if (element.namespaceURI !== SVG_NAMESPACE) return undefined;

  const name = element.localName;
  if (!isTemplateSvgElementName(name)) return undefined;
  if ((name === ROOT_ELEMENT) !== (depth === 1)) return undefined;

  state.elementCount += 1;
  if (state.elementCount > TEMPLATE_SVG_LIMITS.maxElements) return undefined;
  state.maxDepth = Math.max(state.maxDepth, depth);

  const attributes =
    depth === 1 ? buildRootAttributes(element) : buildChildAttributes(element, name);
  if (attributes === undefined) return undefined;

  if (depth === 1) {
    const parsed = parseSvgViewBox(attributes[1]?.value ?? '');
    if (parsed === undefined) return undefined;
    state.viewBox = parsed;
  }

  const pathData = attributes.find((attribute) => attribute.name === 'd');
  if (pathData !== undefined) {
    state.pathDataChars += pathData.value.length;
    if (state.pathDataChars > TEMPLATE_SVG_LIMITS.maxPathDataChars) return undefined;
  }

  const children: CanonicalElement[] = [];
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const node = element.childNodes[index] as SvgDomNode;
    if (isElement(node)) {
      // Only the two container elements may hold elements. A shape with a child
      // is not something SVG renders, so admitting it would put a subtree in the
      // canonical output that no viewer ever draws.
      if (!TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS.includes(name)) return undefined;
      const child = buildElement(node, depth + 1, state);
      if (child === undefined) return undefined;
      children.push(child);
      continue;
    }
    // Whitespace between elements is insignificant and dropped. Every other
    // node kind — text with content, comment, CDATA, processing instruction —
    // rejects the file: each is a place a payload can sit, and each is
    // something DOMPurify would remove, which step 6 would refuse anyway.
    if (node.nodeType !== DOM_TEXT_NODE || (node.nodeValue ?? '').trim() !== '') return undefined;
  }

  return { name, attributes, children };
}

/**
 * Builds the validated canonical document, or `undefined` when the file is
 * rejected.
 *
 * Depth-bounded by construction: `buildElement` refuses before recursing past
 * the ruled maximum, so the recursion can never be deeper than 65 frames no
 * matter how deeply nested the input claims to be.
 */
export function buildCanonicalSvgDocument(root: SvgDomElement): CanonicalSvgDocument | undefined {
  const state: BuildState = {
    elementCount: 0,
    pathDataChars: 0,
    maxDepth: 0,
    viewBox: undefined,
  };

  const element = buildElement(root, 1, state);
  if (element === undefined || state.viewBox === undefined) return undefined;

  return {
    root: element,
    viewBox: state.viewBox,
    elementCount: state.elementCount,
    pathDataChars: state.pathDataChars,
    maxDepth: state.maxDepth,
  };
}
