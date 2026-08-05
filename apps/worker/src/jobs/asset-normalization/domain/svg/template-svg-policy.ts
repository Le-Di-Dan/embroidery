/**
 * The locked Template SVG sanitization policy, version 1 (`IMP-D047`).
 *
 * One frozen worker-owned policy, exactly as `NORMALIZATION_POLICY_V1` is: never
 * a database column, never a derivative kind and never operator-configurable
 * (PO-14). Everything a reviewer has to check to answer "what may a Template SVG
 * contain?" is in this one file, so a widening cannot hide in a validator.
 *
 * The lists are **closed**. Nothing here is a starting point that a caller may
 * extend at run time, and nothing is derived from a library's defaults —
 * DOMPurify's own allowlists are far wider than this and are not the APP3 policy
 * (PO-02).
 */
import { NORMALIZATION_POLICY_VERSION } from '../normalization-policy';

/**
 * The sanitization policy version (PO-14).
 *
 * Defined *as* the normalization policy version rather than beside it: the event
 * carries one number, and a Template SVG job that ran under different sanitizer
 * rules than the producer asked for is precisely the disagreement the version
 * exists to prevent. Two independent constants could drift; this one cannot.
 */
export const TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = NORMALIZATION_POLICY_VERSION;

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The namespace jsdom reports for a namespace *declaration* attribute. */
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

/** The complexity ceilings (PO-11). Boundary passes; boundary plus one rejects. */
export const TEMPLATE_SVG_LIMITS = Object.freeze({
  maxSourceBytes: 1024 * 1024,
  maxElements: 10_000,
  maxPathDataChars: 1_000_000,
  maxDepth: 64,
});

/** The `viewBox` ceilings (PO-10), which also fix the derivative metadata. */
export const TEMPLATE_SVG_VIEWBOX_LIMITS = Object.freeze({
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 16_777_216,
});

/**
 * Numeric canonicalization (PO-09, corrected by `APP3-W01B-C1`).
 *
 * There is deliberately **no constant here**. Canonicalization is the shortest
 * decimal token that parses back to the identical binary64 value, and it lives
 * entirely in `svg-number.ts`; a precision budget or a magnitude ceiling in this
 * file would be a knob that silently changes approved geometry. The design
 * engine's own quantization (`IMP-D045`, scale 10,000) governs design documents
 * and is deliberately not applied to Template SVG.
 */

/** The element allowlist (PO-06). Everything absent from this list rejects. */
export const TEMPLATE_SVG_ELEMENTS = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
] as const;

export type TemplateSvgElementName = (typeof TEMPLATE_SVG_ELEMENTS)[number];

export function isTemplateSvgElementName(name: string): name is TemplateSvgElementName {
  return (TEMPLATE_SVG_ELEMENTS as readonly string[]).includes(name);
}

/** The root's attributes are exactly these two, in this order (PO-07, PO-13). */
export const TEMPLATE_SVG_ROOT_ATTRIBUTES = ['xmlns', 'viewBox'] as const;

/**
 * Presentation attributes, allowed on every allowed element except the root.
 *
 * The root carries geometry and namespace only: a `fill` on `<svg>` would be an
 * inherited paint whose canonical position in the tree is ambiguous, and PO-07
 * closes the root set at two names rather than leaving that to a serializer.
 */
export const TEMPLATE_SVG_PRESENTATION_ATTRIBUTES = [
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
] as const;

/** Geometry attributes, per element and only where semantically valid (PO-07). */
export const TEMPLATE_SVG_GEOMETRY_ATTRIBUTES: Readonly<
  Record<TemplateSvgElementName, readonly string[]>
> = Object.freeze({
  svg: [],
  g: [],
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
});

/** The complete attribute set an element admits. Root is the closed pair. */
export function allowedAttributesFor(element: TemplateSvgElementName): readonly string[] {
  if (element === 'svg') return TEMPLATE_SVG_ROOT_ATTRIBUTES;
  return [...TEMPLATE_SVG_PRESENTATION_ATTRIBUTES, ...TEMPLATE_SVG_GEOMETRY_ATTRIBUTES[element]];
}

/** Every attribute name DOMPurify may keep — the union of all element sets. */
export const TEMPLATE_SVG_ALL_ATTRIBUTES: readonly string[] = Object.freeze([
  ...new Set(
    TEMPLATE_SVG_ELEMENTS.flatMap((element) => [
      ...allowedAttributesFor(element),
      ...TEMPLATE_SVG_GEOMETRY_ATTRIBUTES[element],
    ]),
  ),
]);

/** The enumerated value sets (PO-09). */
export const TEMPLATE_SVG_ENUMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'fill-rule': ['nonzero', 'evenodd'],
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'],
});

/**
 * The sanitized output (PO-13, PO-15).
 *
 * `NORMALIZED` and unwatermarked, exactly as the raster lane: sanitization
 * produces an editor-safe private derivative and authorizes nothing else.
 */
export const TEMPLATE_SVG_OUTPUT_POLICY = Object.freeze({
  kind: 'NORMALIZED' as const,
  mediaType: 'image/svg+xml' as const,
  isWatermarked: false as const,
});

/**
 * Elements serialized with an explicit start and end tag (PO-13).
 *
 * The container elements only. One locked empty-element form for everything
 * else means `<path .../>` is the sole shape spelling, so two sources that
 * differ only in how they closed a tag cannot produce two different outputs.
 */
export const TEMPLATE_SVG_EXPLICIT_CLOSE_ELEMENTS: readonly string[] = Object.freeze(['svg', 'g']);
