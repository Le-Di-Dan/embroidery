'use client';

import { memo } from 'react';

import type { DesignElement } from '@embroidery/design-document';

import { elementLabel } from '../model/studio-stage-label';
import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import {
  FREEHAND_CAP,
  FREEHAND_JOIN,
  LINE_CAP,
  LINE_JOIN,
  RECTANGLE_LINE_JOIN,
  RECTANGLE_MITER_LIMIT,
  freehandPoints,
  textAnchorFor,
  textAnchorXFor,
} from '../renderer/studio-paint';
import type { RenderableElement } from '../renderer/studio-scene';

export interface StudioStageElementProps {
  readonly renderable: RenderableElement;
  readonly selected: boolean;
  readonly onSelect: (elementId: string) => void;
}

/**
 * One document element, drawn in its **local** box and placed by the engine's
 * matrix (`606:3`, `606:63`).
 *
 * `APP3-P02` defines an element's local space as `0,0` → `width,height` and
 * folds the authored `x`/`y`, the rotation and the scale into the effective
 * matrix. Drawing at the local origin and applying that matrix is therefore the
 * entire geometry of this file: an element positioned at its `x`/`y` *and*
 * transformed would be placed twice. There is no arithmetic here beyond
 * splitting a box in half to find its centre, which is a fact about a rectangle
 * rather than about a transform.
 *
 * The stroke constants come from the engine rather than from literals, because
 * the engine measured the element's bounds with exactly those cap, join and
 * miter values. A renderer that painted a different join would paint outside
 * the outline drawn around it.
 *
 * `<g role="button">` is a real control: focusable, activated by Enter and
 * Space, and labelled. An SVG shape carries none of that on its own, so a stage
 * built from bare shapes would be selectable by pointer only.
 *
 * ## Memoized on identity, never on a hand-written comparator (`APP3-S03-C1`)
 *
 * A transform gesture replaces the whole document once per frame, so before
 * `S03-C1` every element in the scene re-rendered to redraw the one being
 * dragged. The adapter now hands back the *same* `RenderableElement` instance
 * for an element whose value and whose ancestors' values did not change, so
 * React's default shallow comparison is enough and is exactly right: everything
 * this component paints — the matrix, the opacity, the kind, the content, the
 * controlled family, the label — is reached through that one object, and
 * `selected` is the only other prop. There is no custom `areEqual` deciding
 * which fields are worth comparing, because a field left out of one is a stale
 * element on the stage that nothing would report.
 */
export const StudioStageElement = memo(function StudioStageElement({
  renderable,
  selected,
  onSelect,
}: StudioStageElementProps) {
  const { element } = renderable;

  const select = () => {
    onSelect(element.id);
  };

  return (
    <g
      transform={renderable.transform}
      opacity={element.opacity}
      role="button"
      tabIndex={0}
      aria-label={elementLabel(element)}
      aria-pressed={selected}
      data-selected={selected}
      data-element-type={element.type}
      data-testid={`studio-element-${element.id}`}
      onClick={(event) => {
        // The stage clears the selection on its own background clicks, so a hit
        // on an element must not also read as a hit on the canvas behind it.
        event.stopPropagation();
        select();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      }}
    >
      <ElementShape element={element} fontFamily={renderable.fontFamily} />
    </g>
  );
});

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
          className="studio-stage__text"
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
      // A group is filtered out before it reaches the stage (PO-07).
      return null;
  }
}

/**
 * An honest empty frame at the image's real geometry — never a picture.
 *
 * No public route serves a Design Session's own image bytes: `APP3-B06C` is not
 * built, and `APP3-B05A` serves published *Template* assets under an authority
 * a cloned Session does not inherit — clone independence means Template lineage
 * is provenance, not permission. So nothing here fetches storage, builds a URL
 * or falls back to another route, and the placeholder is deliberately drawn to
 * look like a placeholder: a customer must never mistake it for their artwork.
 *
 * The geometry is still exact. The frame occupies the element's local box, so
 * the engine's transform places it where the image belongs and the selection
 * outline lands on it correctly — which is what keeps the deferred capability a
 * missing *picture* rather than a missing *element*.
 */
function ImagePlaceholder({ width, height }: { readonly width: number; readonly height: number }) {
  const labelSize = Math.max(Math.min(width, height) / 8, 1);

  return (
    <g data-testid="studio-image-placeholder">
      <rect className="studio-stage__image-placeholder" x={0} y={0} width={width} height={height} />
      <text
        className="studio-stage__placeholder-label"
        x={width / 2}
        y={height / 2}
        fontSize={labelSize}
        textAnchor="middle"
      >
        {STUDIO_STAGE_COPY.imagePlaceholder}
      </text>
    </g>
  );
}
