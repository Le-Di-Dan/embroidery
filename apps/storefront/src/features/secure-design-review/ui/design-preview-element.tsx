'use client';

/**
 * One document element, drawn read-only in its **local** box and placed by the
 * engine's matrix (`APP6-S02` §10, §12).
 *
 * `APP3-P02` defines an element's local space as `0,0` → `width,height` and
 * folds the authored `x`/`y`, the rotation and the scale into the effective
 * matrix. Drawing at the local origin and applying that matrix is therefore the
 * entire geometry of this file: an element positioned at its `x`/`y` *and*
 * transformed would be placed twice. There is no arithmetic here beyond
 * splitting a box in half to find its centre, which is a fact about a rectangle
 * rather than about a transform.
 *
 * ## Read-only, and structurally so
 *
 * The Studio's painter is a real control — `<g role="button">`, focusable,
 * `aria-pressed`, activated by Enter and Space — because a customer authoring a
 * design must be able to select what they are editing. On a review surface that
 * capability has no meaning and would be a lie about what the screen can do, so
 * this element carries no role, no `tabIndex`, no handler and no selected
 * state. There is nothing here to press.
 *
 * ## Everything is data binding; nothing is markup
 *
 * The stored document is untrusted structured data that `APP3-P01` has
 * validated. It becomes SVG *nodes* with *attribute values*, never markup:
 * there is no `dangerouslySetInnerHTML`, no `foreignObject`, no `<script>`, no
 * event-handler attribute taken from document data and no external image URL.
 * Text renders as an SVG `<text>` node whose child is the string, so a document
 * containing `<script>` renders those characters and executes nothing.
 *
 * ## Why an image is a frame and not a picture
 *
 * `APP6-B10` returns the document and no media. There is no session on this
 * surface, no derivative route the grant authorises, and a Template URL is not
 * a fallback — clone independence means lineage is provenance, not permission.
 * So an image element is drawn as an honest placeholder at its exact geometry:
 * the frame occupies the element's local box, so the engine's transform places
 * it where the picture belongs, and the customer is never shown a stale or
 * borrowed picture in place of their own artwork.
 */
import type { DesignElement, FreehandPoint, TextAlign } from '@embroidery/design-document';
import {
  FREEHAND_CAP,
  FREEHAND_JOIN,
  LINE_CAP,
  LINE_JOIN,
  RECTANGLE_LINE_JOIN,
  RECTANGLE_MITER_LIMIT,
} from '@embroidery/design-engine';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import { placedFontFamily, type PlacedElement } from '../model/review-scene';

/**
 * The painted stroke is bound to the engine's own constants rather than to
 * literals, because those are the cap, join and miter values `APP3-P02`
 * measured the element's envelope with. A renderer that painted a different
 * join would paint outside the geometry the engine resolved.
 */
export function DesignPreviewElement({ placed }: { readonly placed: PlacedElement }) {
  const { element } = placed;
  if (!element.visible) return null;

  return (
    <g
      transform={placed.transform}
      opacity={element.opacity}
      data-element-type={element.type}
      data-testid={`design-review-element-${element.id}`}
    >
      <ElementShape element={element} fontFamily={placedFontFamily(placed)} />
    </g>
  );
}

/** `textAlign` as SVG's `text-anchor`. */
function textAnchorFor(align: TextAlign): 'start' | 'middle' | 'end' {
  if (align === 'center') return 'middle';
  return align === 'right' ? 'end' : 'start';
}

/**
 * Where the anchor sits inside the element's own local box.
 *
 * The box runs `0,0` to `width,height` — `APP3-P02` folds the authored `x`/`y`
 * into the effective matrix — so an aligned run of text is positioned by moving
 * its anchor, never by offsetting the element a second time.
 */
function textAnchorXFor(align: TextAlign, width: number): number {
  if (align === 'center') return width / 2;
  return align === 'right' ? width : 0;
}

/** A freehand path's `points` attribute, in the element's local frame. */
function freehandPoints(points: readonly FreehandPoint[]): string {
  return points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
}

function ElementShape({
  element,
  fontFamily,
}: {
  readonly element: DesignElement;
  readonly fontFamily: string | null;
}) {
  const { width, height } = element.transform;

  switch (element.type) {
    case 'text':
      return (
        <text
          className="secure-design-review__preview-text"
          x={textAnchorXFor(element.textAlign, width)}
          y={element.fontSizePx}
          fontFamily={fontFamily ?? undefined}
          fontSize={element.fontSizePx}
          fontWeight={element.fontWeight}
          fontStyle={element.fontStyle}
          textAnchor={textAnchorFor(element.textAlign)}
          fill={element.fill}
        >
          {element.text}
        </text>
      );

    case 'image':
      return <ImagePlaceholder width={width} height={height} />;

    case 'shape':
      if (element.shape === 'ellipse') {
        return (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={width / 2}
            ry={height / 2}
            fill={element.fill}
            stroke={element.stroke}
            strokeWidth={element.strokeWidthPx}
          />
        );
      }
      if (element.shape === 'line') {
        // v1 stores no endpoints; the path is the declared box's diagonal,
        // which is exactly what the engine's envelope measures.
        return (
          <line
            x1={0}
            y1={0}
            x2={width}
            y2={height}
            stroke={element.stroke}
            strokeWidth={element.strokeWidthPx}
            strokeLinecap={LINE_CAP}
            strokeLinejoin={LINE_JOIN}
          />
        );
      }
      return (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidthPx}
          strokeLinejoin={RECTANGLE_LINE_JOIN}
          strokeMiterlimit={RECTANGLE_MITER_LIMIT}
        />
      );

    case 'freehand':
      return (
        <polyline
          points={freehandPoints(element.points)}
          fill="none"
          stroke={element.stroke}
          strokeWidth={element.strokeWidthPx}
          strokeLinecap={FREEHAND_CAP}
          strokeLinejoin={FREEHAND_JOIN}
        />
      );

    default:
      // A group is filtered out before it reaches the preview.
      return null;
  }
}

/**
 * An honest empty frame at the image's real geometry — never a picture.
 *
 * Deliberately drawn to look like a placeholder: a customer must never mistake
 * it for their artwork, and must never approve a design believing they have
 * seen a photograph the browser was in fact not shown.
 */
function ImagePlaceholder({ width, height }: { readonly width: number; readonly height: number }) {
  const labelSize = Math.max(Math.min(width, height) / 8, 1);

  return (
    <g data-testid="design-review-image-placeholder">
      <rect
        className="secure-design-review__preview-image-frame"
        x={0}
        y={0}
        width={width}
        height={height}
      />
      <text
        className="secure-design-review__preview-image-label"
        x={width / 2}
        y={height / 2}
        fontSize={labelSize}
        textAnchor="middle"
      >
        {COPY.preview.imagePlaceholder}
      </text>
    </g>
  );
}
