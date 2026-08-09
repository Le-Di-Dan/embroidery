'use client';

import type { DesignElement } from '@embroidery/design-document';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';

interface EditorStageElementProps {
  readonly element: DesignElement;
  /** The engine's effective transform, or `null` when it could not resolve. */
  readonly matrix: string | null;
  readonly selected: boolean;
  readonly onSelect: (elementId: string) => void;
}

/**
 * One document element, drawn in its **local** box and placed by the engine's
 * matrix.
 *
 * `@embroidery/design-engine` defines an element's local space as `0,0` to
 * `width,height` and folds the authored `x`/`y`, the rotation and the scale into
 * the effective matrix. Drawing at the local origin and applying that matrix is
 * therefore the whole of the geometry in this file — an element positioned at
 * `x`/`y` directly *and* transformed would be placed twice.
 *
 * An element the engine could not resolve — a cyclic group, an unusable
 * transform — is not drawn at all. Drawing it at the identity would put it at
 * the canvas origin, which looks like a position rather than like a failure.
 *
 * A group paints nothing of its own (`IMP-D045` PO-07); its children carry the
 * composed matrix and are already in the element array in their own right.
 */
export function EditorStageElement({
  element,
  matrix,
  selected,
  onSelect,
}: EditorStageElementProps) {
  if (matrix === null || element.type === 'group' || !element.visible) return null;

  const select = () => {
    onSelect(element.id);
  };

  return (
    <g
      transform={matrix}
      opacity={element.opacity}
      role="button"
      tabIndex={0}
      aria-label={elementLabel(element)}
      aria-pressed={selected}
      data-selected={selected}
      data-element-type={element.type}
      data-testid={`editor-element-${element.id}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      }}
    >
      <ElementShape element={element} />
    </g>
  );
}

function ElementShape({ element }: { readonly element: DesignElement }) {
  const { width, height } = element.transform;

  switch (element.type) {
    case 'text':
      return (
        <text
          className="template-editor-stage__text"
          x={anchorX(element.textAlign, width)}
          y={element.fontSizePx}
          fontSize={element.fontSizePx}
          fontWeight={element.fontWeight}
          fontStyle={element.fontStyle}
          textAnchor={anchorFor(element.textAlign)}
          fill={element.fill}
          data-font-id={element.fontId}
        >
          {element.text}
        </text>
      );

    case 'image':
      /*
        An honest empty frame, not a picture.

        There is no authenticated Admin route that serves a draft Template's
        asset bytes — `APP3-B05A` serves *published* Template assets and
        `APP3-B06C` serves Design Session uploads, and neither is permission to
        read this. So the element is drawn at its real geometry with a label
        saying what cannot be shown. Nothing here fetches storage, builds a URL,
        or falls back to a public route; and the Asset id is deliberately not the
        label, because an internal identifier is not a name.
      */
      return (
        <g data-testid="editor-image-placeholder">
          <rect
            className="template-editor-stage__image-placeholder"
            x={0}
            y={0}
            width={width}
            height={height}
          />
          <text
            className="template-editor-stage__placeholder-label"
            x={width / 2}
            y={height / 2}
            fontSize={Math.max(Math.min(width, height) / 10, 1)}
            textAnchor="middle"
          >
            {DESIGN_TEMPLATE_EDITOR_COPY.image.placeholder}
          </text>
        </g>
      );

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
        // v1 stores no endpoints; the path is the declared box's diagonal, which
        // is exactly what the engine's envelope measures.
        return (
          <line
            x1={0}
            y1={0}
            x2={width}
            y2={height}
            stroke={element.stroke}
            strokeWidth={element.strokeWidthPx}
            strokeLinecap="round"
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
        />
      );

    case 'freehand':
      return (
        <polyline
          points={element.points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ')}
          fill="none"
          stroke={element.stroke}
          strokeWidth={element.strokeWidthPx}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    default:
      return null;
  }
}

function anchorFor(align: 'left' | 'center' | 'right'): 'start' | 'middle' | 'end' {
  if (align === 'center') return 'middle';
  return align === 'right' ? 'end' : 'start';
}

function anchorX(align: 'left' | 'center' | 'right', width: number): number {
  if (align === 'center') return width / 2;
  return align === 'right' ? width : 0;
}

function elementLabel(element: DesignElement): string {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.layers;
  switch (element.type) {
    case 'text':
      return element.text.trim() === '' ? copy.unnamedText : element.text;
    case 'image':
      return copy.typeImage;
    case 'shape':
      return copy.typeShape;
    case 'freehand':
      return copy.typeFreehand;
    default:
      return copy.typeGroup;
  }
}

export { elementLabel };
