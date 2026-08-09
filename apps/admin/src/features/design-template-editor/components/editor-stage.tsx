'use client';

import {
  buildElementGraph,
  containsBounds,
  getElementBounds,
  isGeometryFinding,
  rectToBounds,
  resolveEffectiveTransform,
  type Bounds2D,
} from '@embroidery/design-engine';
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { ResolvedTemplateScope } from '../model/editor-scope';
import { EditorStageElement } from './editor-stage-element';

/**
 * Four of these are not failures, and presenting them as one would mislead: an
 * absent background is a fact about the Side, not an error the operator caused.
 */
export type StageBackground =
  | { readonly kind: 'ready'; readonly objectUrl: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed'; readonly retryable: boolean; readonly onRetry: () => void };

interface EditorStageProps {
  readonly document: DesignDocument;
  readonly scope: ResolvedTemplateScope | null;
  readonly background: StageBackground;
  readonly selectedElementId: string | null;
  readonly onSelect: (elementId: string) => void;
  readonly onClearSelection: () => void;
}

/**
 * The design stage (`601:3`, `601:48`).
 *
 * Rendered as **SVG**, which `05-FRONTEND-AND-SCSS-STANDARD.md` §8 prescribes
 * for geometry and `IMP-D026` locks as the rendering architecture. There is no
 * Canvas, no Konva, no Fabric and no second renderer.
 *
 * The `viewBox` **is** the document's own placement canvas, so every element is
 * drawn at its authored coordinates with no scaling arithmetic in this file: no
 * percentages, no computed offsets, nothing to round. The browser scales the
 * whole coordinate system, which is what makes the stage elastic at 1280
 * (`618:3`) without reflowing anything.
 *
 * Painting order is document order, bottom first, because SVG has no `z-index`
 * — document order *is* the stacking, and `APP3-P01` defines the element array
 * as z-order with the same convention. Nothing here re-sorts.
 *
 * Every transform, bound and containment answer comes from
 * `@embroidery/design-engine`. No matrix is multiplied here, no rotation is
 * expanded here, and no formula is copied here: `IMP-D045` locks the semantics
 * and a renderer implements the contract rather than restating it.
 *
 * The stage is not the only way to select. It carries `role="group"` rather than
 * any focus-trapping construct, and the layer list offers the same selection by
 * keyboard — an operator who cannot use a pointer is never sent to the canvas.
 */
export function EditorStage({
  document,
  scope,
  background,
  selectedElementId,
  onSelect,
  onClearSelection,
}: EditorStageProps) {
  const { canvasWidthPx, canvasHeightPx } = document.placement;
  const graph = buildElementGraph(document);

  const areaLimits =
    scope === null
      ? null
      : rectToBounds({
          x: scope.area.boundXPx,
          y: scope.area.boundYPx,
          width: scope.area.boundWidthPx,
          height: scope.area.boundHeightPx,
        });

  const selectedBounds = selectionBounds(document, selectedElementId);
  const selectionOutOfBounds =
    areaLimits !== null && selectedBounds !== null && !containsBounds(areaLimits, selectedBounds);

  // Labels are expressed in canvas units so they scale with the drawing. A
  // divisor of the canvas width keeps the *rendered* size roughly constant
  // whatever the Side was authored at.
  const labelSize = canvasWidthPx / 40;

  return (
    <section className="template-editor-stage" aria-label={DESIGN_TEMPLATE_EDITOR_COPY.stage.title}>
      <div className="template-editor-stage__frame">
        <BackgroundNotice background={background} />

        <svg
          className="template-editor-stage__canvas"
          viewBox={`0 0 ${String(canvasWidthPx)} ${String(canvasHeightPx)}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={DESIGN_TEMPLATE_EDITOR_COPY.stage.label(canvasWidthPx, canvasHeightPx)}
          data-testid="editor-stage-canvas"
          onClick={(event) => {
            // A click that reached the canvas itself hit no element.
            if (event.target === event.currentTarget) onClearSelection();
          }}
        >
          {/*
            The bottom layer, in the document's own pixel space. `aria-hidden`
            because it is contextual artwork, not a control: the elements above
            it are what an operator acts on.
          */}
          {background.kind === 'ready' ? (
            <image
              className="template-editor-stage__background"
              href={background.objectUrl}
              x={0}
              y={0}
              width={canvasWidthPx}
              height={canvasHeightPx}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
              data-testid="editor-stage-background"
            />
          ) : null}

          {areaLimits === null ? null : (
            <g aria-hidden="true" data-testid="editor-stage-area">
              <rect
                className="template-editor-stage__area"
                x={scope?.area.boundXPx}
                y={scope?.area.boundYPx}
                width={scope?.area.boundWidthPx}
                height={scope?.area.boundHeightPx}
              />
              {/* The safe boundary is a presentation of the same authored
                  rectangle, not a second geometry: A03 authors no placement. */}
              <rect
                className="template-editor-stage__safe"
                x={(scope?.area.boundXPx ?? 0) + labelSize}
                y={(scope?.area.boundYPx ?? 0) + labelSize}
                width={Math.max((scope?.area.boundWidthPx ?? 0) - labelSize * 2, 0)}
                height={Math.max((scope?.area.boundHeightPx ?? 0) - labelSize * 2, 0)}
                data-testid="editor-stage-safe-boundary"
              />
            </g>
          )}

          {document.elements.map((element) => (
            <EditorStageElement
              key={element.id}
              element={element}
              matrix={matrixFor(graph, element)}
              selected={element.id === selectedElementId}
              onSelect={onSelect}
            />
          ))}

          {selectedBounds === null ? null : (
            <SelectionOverlay bounds={selectedBounds} handleSize={labelSize} />
          )}
        </svg>
      </div>

      {document.elements.length === 0 ? (
        <p className="template-editor-stage__empty" data-testid="editor-stage-empty">
          {DESIGN_TEMPLATE_EDITOR_COPY.stage.empty}
        </p>
      ) : null}

      {/*
        Feedback, never a guard. `APP3-B04` owns the publication geometry, and
        refusing a draft save here would be a second, weaker definition of
        publishable — so this reports and the save button stays enabled.
      */}
      {selectionOutOfBounds ? (
        <p
          className="template-editor-stage__warning"
          role="status"
          data-testid="editor-out-of-bounds"
        >
          <strong>{DESIGN_TEMPLATE_EDITOR_COPY.stage.outOfBounds}</strong>{' '}
          {DESIGN_TEMPLATE_EDITOR_COPY.stage.outOfBoundsNote}
        </p>
      ) : null}
    </section>
  );
}

/** The engine's answer, or `null` — never a locally computed fallback. */
function matrixFor(
  graph: ReturnType<typeof buildElementGraph>,
  element: DesignElement,
): string | null {
  const resolved = resolveEffectiveTransform(graph, element.id);
  if (isGeometryFinding(resolved)) return null;
  const { a, b, c, d, e, f } = resolved.matrix;
  return `matrix(${String(a)} ${String(b)} ${String(c)} ${String(d)} ${String(e)} ${String(f)})`;
}

function selectionBounds(document: DesignDocument, elementId: string | null): Bounds2D | null {
  if (elementId === null) return null;
  const bounds = getElementBounds(document, elementId);
  return isGeometryFinding(bounds as never) ? null : (bounds as Bounds2D);
}

/**
 * The selection outline and its handles.
 *
 * The handles are `aria-hidden` and non-interactive on purpose. Transform values
 * are edited in the inspector, where each one is a labelled control with its
 * unit — a drag handle is not reachable by keyboard and announces nothing, so
 * making it the only way to move an element would put the whole capability
 * behind a pointer.
 */
function SelectionOverlay({
  bounds,
  handleSize,
}: {
  readonly bounds: Bounds2D;
  readonly handleSize: number;
}) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const half = handleSize / 2;
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX + width / 2, y: bounds.minY },
    { x: bounds.minX + width / 2, y: bounds.maxY },
    { x: bounds.minX, y: bounds.minY + height / 2 },
    { x: bounds.maxX, y: bounds.minY + height / 2 },
  ];

  return (
    <g aria-hidden="true" data-testid="editor-selection-overlay">
      <rect
        className="template-editor-stage__selection"
        x={bounds.minX}
        y={bounds.minY}
        width={width}
        height={height}
      />
      {corners.map((corner) => (
        <rect
          key={`${String(corner.x)}:${String(corner.y)}`}
          className="template-editor-stage__handle"
          x={corner.x - half}
          y={corner.y - half}
          width={handleSize}
          height={handleSize}
        />
      ))}
    </g>
  );
}

function BackgroundNotice({ background }: { readonly background: StageBackground }) {
  if (background.kind === 'ready') return null;

  if (background.kind === 'failed') {
    return (
      <div
        className="template-editor-stage__notice"
        role="alert"
        data-testid="editor-background-notice"
      >
        <p>
          {background.retryable
            ? DESIGN_TEMPLATE_EDITOR_COPY.background.failed
            : DESIGN_TEMPLATE_EDITOR_COPY.background.unavailable}
        </p>
        {/* Retry only where retrying can work: a 404 means the server will not
            resolve a background at this address at all. */}
        {background.retryable ? (
          <button
            type="button"
            className="template-editor-stage__notice-action"
            data-testid="editor-background-retry"
            onClick={background.onRetry}
          >
            {DESIGN_TEMPLATE_EDITOR_COPY.background.retry}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="template-editor-stage__notice"
      role="status"
      data-testid="editor-background-notice"
    >
      <p>
        {background.kind === 'loading'
          ? DESIGN_TEMPLATE_EDITOR_COPY.background.loading
          : DESIGN_TEMPLATE_EDITOR_COPY.background.unavailable}
      </p>
    </div>
  );
}
