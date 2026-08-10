'use client';

import { type CSSProperties, type RefObject } from 'react';

import type { DesignDocument } from '@embroidery/design-document';
import {
  type ElementGraph,
  boundsSize,
  getElementBounds,
  isGeometryFinding,
  type Bounds2D,
  sizePxToMm,
  transformPoint,
  type Vector2D,
} from '@embroidery/design-engine';

import { documentToPercent, handleCounterScale } from '../model/studio-stage-mapping';
import { STUDIO_TRANSFORM_COPY } from '../model/studio-transform-copy';
import { RESIZE_HANDLES, handleLocalPoint } from '../model/studio-transform-handles';
import { elementFrames, rotationAnchors } from '../model/studio-transform';
import type { StudioTransformApi } from '../hooks/use-studio-transform';

/** How far the rotate affordance sits beyond the top edge, in document units. */
const ROTATE_OFFSET_RATIO = 0.05;
const MIN_ROTATE_OFFSET_PX = 8;

export interface StudioTransformOverlayProps {
  readonly document: DesignDocument;
  readonly elementId: string;
  /** Built once per document by the screen. Rebuilding it here cost a frame. */
  readonly graph: ElementGraph;
  readonly zoom: number;
  readonly transform: StudioTransformApi;
  readonly overlayRef: RefObject<HTMLDivElement | null>;
}

/**
 * The DOM transform chrome (`APP3-S03`).
 *
 * `IMP-D026` requires the handles to be **DOM elements outside the element box,
 * at least 44 px and focusable** — so none of this is drawn into the SVG. That
 * keeps three things true at once: the `APP3-S02` scene stays byte-identical and
 * still contains only document content, the transform chrome never enters the
 * canonical document or its hash, and a handle can be a real `<button>` that
 * assistive technology and a keyboard can both reach.
 *
 * ## Why it aligns at every zoom without measuring anything
 *
 * The overlay sits **inside** the `APP3-S07` transform layer, so it inherits the
 * viewport transform exactly as the artwork does — there is no second transform
 * to keep in step. Within it, every position is a percentage of the stage box,
 * and `docX / canvasWidthPx` is that percentage at any width because the canvas
 * preserves the document's aspect ratio. The handles are placed at the points
 * `APP3-P02` says the local box's corners map to, so they trace the **oriented**
 * box rather than the axis-aligned bounds — an AABB would leave every handle off
 * the artwork the moment an element is rotated.
 *
 * Each control is then counter-scaled by `1 / zoom`, which is what keeps a
 * 44 px hit target 44 px on screen instead of 176 px at 400 %.
 */
export function StudioTransformOverlay({
  document,
  elementId,
  graph,
  zoom,
  transform,
  overlayRef,
}: StudioTransformOverlayProps) {
  const frames = elementFrames(graph, elementId);
  const element = document.elements.find((candidate) => candidate.id === elementId);
  if (frames === undefined || element === undefined) return null;

  const { canvasWidthPx, canvasHeightPx } = document.placement;
  const { width, height } = element.transform;
  const percent = (point: Vector2D) => documentToPercent(canvasWidthPx, canvasHeightPx, point);
  const counterScale = handleCounterScale(zoom);

  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((local) => percent(transformPoint(frames.effective, local)));

  const { pivot, grab } = rotationAnchors(element.transform, frames);
  const rotatePoint = pushAway(pivot, grab, canvasHeightPx);

  return (
    <div
      className="studio-stage__overlay"
      data-testid="studio-transform-overlay"
      ref={overlayRef}
      onPointerMove={transform.onPointerMove}
      onPointerUp={transform.onPointerUp}
      onPointerCancel={transform.onPointerUp}
    >
      {/*
        The move surface: the oriented box, clipped to the exact four corners
        `APP3-P02` resolved. A clip path rather than a rotated rectangle because
        it stays exact under a non-uniformly scaled group, where a single CSS
        rotation would only approximate the shape.
      */}
      <div
        className="studio-stage__move-surface"
        data-testid="studio-transform-move"
        role="button"
        tabIndex={0}
        aria-label={STUDIO_TRANSFORM_COPY.move}
        style={{
          clipPath: `polygon(${corners.map((c) => `${pct(c.left)} ${pct(c.top)}`).join(', ')})`,
        }}
        onPointerDown={transform.beginMove}
      />

      {RESIZE_HANDLES.map((handle) => (
        <HandleButton
          key={handle}
          className="studio-stage__handle"
          testId={`studio-transform-handle-${handle}`}
          label={STUDIO_TRANSFORM_COPY.resize(handle)}
          position={percent(
            transformPoint(frames.effective, handleLocalPoint(handle, width, height)),
          )}
          counterScale={counterScale}
          onPointerDown={(event) => {
            transform.beginResize(handle, event);
          }}
        />
      ))}

      <HandleButton
        className="studio-stage__handle studio-stage__handle--rotate"
        testId="studio-transform-rotate"
        label={STUDIO_TRANSFORM_COPY.rotate}
        position={percent(rotatePoint)}
        counterScale={counterScale}
        onPointerDown={transform.beginRotate}
      />
    </div>
  );
}

interface HandleButtonProps {
  readonly className: string;
  readonly testId: string;
  readonly label: string;
  readonly position: { readonly left: number; readonly top: number };
  readonly counterScale: number;
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

function HandleButton({
  className,
  testId,
  label,
  position,
  counterScale,
  onPointerDown,
}: HandleButtonProps) {
  const style: CSSProperties = {
    left: pct(position.left),
    top: pct(position.top),
    transform: `translate(-50%, -50%) scale(${String(counterScale)})`,
  };
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      data-testid={testId}
      onPointerDown={onPointerDown}
    >
      {/* The visible knob. The button around it is the ≥44 px hit target. */}
      <span className="studio-stage__handle-knob" aria-hidden="true" />
    </button>
  );
}

/**
 * The element's physical size, from `APP3-P02` bounds and the Side's `pxPerMm`.
 *
 * Never from CSS pixels, device pixel ratio, 96 DPI or the viewport scale
 * (`IMP-D045` PO-10). Zooming changes how large the element looks and changes
 * nothing here, which is the whole point of stating it.
 */
export function physicalSizeLabel(
  document: DesignDocument,
  elementId: string,
  pxPerMm: number,
  graph: ElementGraph,
): string {
  const bounds = getElementBounds(document, elementId, graph);
  if (isGeometryFinding(bounds as never)) return STUDIO_TRANSFORM_COPY.physicalSizeUnavailable;
  try {
    const size = sizePxToMm(boundsSize(bounds as Bounds2D), pxPerMm);
    return STUDIO_TRANSFORM_COPY.physicalSize(size.width, size.height);
  } catch {
    return STUDIO_TRANSFORM_COPY.physicalSizeUnavailable;
  }
}

function pct(value: number): string {
  return `${value.toFixed(4)}%`;
}

/** Moves the rotate grab point away from the pivot by a canvas-proportional gap. */
function pushAway(pivot: Vector2D, grab: Vector2D, canvasHeightPx: number): Vector2D {
  const dx = grab.x - pivot.x;
  const dy = grab.y - pivot.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return grab;
  const gap = Math.max(canvasHeightPx * ROTATE_OFFSET_RATIO, MIN_ROTATE_OFFSET_PX);
  return { x: grab.x + (dx / length) * gap, y: grab.y + (dy / length) * gap };
}
