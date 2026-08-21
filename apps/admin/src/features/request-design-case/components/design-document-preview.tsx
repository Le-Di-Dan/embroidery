'use client';

import {
  buildElementGraph,
  isGeometryFinding,
  resolveEffectiveTransform,
} from '@embroidery/design-engine';
import type { ElementGraph } from '@embroidery/design-engine';
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';

interface DesignDocumentPreviewProps {
  readonly document: DesignDocument;
  /** The element the authoring surface is acting on, when there is one. */
  readonly selectedElementId?: string | null;
  readonly onSelect?: ((elementId: string) => void) | undefined;
  readonly testId?: string;
}

/**
 * A Design Document, drawn client-side as **SVG**.
 *
 * `05-FRONTEND-AND-SCSS-STANDARD.md` §8 prescribes SVG for geometry and
 * `IMP-D026` locks it as the rendering architecture. There is no Canvas, no
 * Konva, no Fabric, no Pixi and no second renderer — the same native React SVG
 * model the APP3 Studio and the APP3 Admin Template editor already draw with.
 *
 * ### The geometry is the engine's, restated nowhere
 *
 * Every effective transform comes from `@embroidery/design-engine`. No matrix is
 * multiplied here, no rotation is expanded here and no formula is copied here:
 * `IMP-D045` locks the semantics and a renderer implements the contract rather
 * than restating it. The `viewBox` **is** the document's own placement canvas,
 * so every element draws at its authored coordinates with no scaling arithmetic
 * in this file — which is also what makes the preview elastic at 1280 without
 * reflowing anything.
 *
 * Painting order is document order, bottom first, because SVG has no `z-index`:
 * document order *is* the stacking, and `APP3-P01` defines the element array
 * with the same convention. Nothing here re-sorts.
 *
 * ### An element the engine cannot resolve is not drawn
 *
 * A cyclic group or an unusable transform yields no matrix, and such an element
 * is skipped rather than drawn at the identity — drawing it at the canvas origin
 * would look like a position rather than like a failure.
 *
 * ### It renders, and nothing else
 *
 * No server raster, no derivative, no export, no download and no storage URL.
 * The bytes never leave the browser, and the document is never written to any
 * kind of persistent browser storage.
 *
 * There is deliberately **no runtime watermark**. `APP3-S09`'s treatment is
 * drawn on the *customer* preview, and the approved A02 frames do not show it on
 * this Admin surface — adding it here would be inventing a treatment the design
 * does not specify.
 */
export function DesignDocumentPreview({
  document,
  selectedElementId = null,
  onSelect,
  testId = 'design-document-preview',
}: DesignDocumentPreviewProps) {
  const { canvasWidthPx, canvasHeightPx } = document.placement;
  const graph = buildElementGraph(document);

  if (document.elements.length === 0) {
    return (
      <p className="request-design-case__preview-empty" data-testid={`${testId}-empty`}>
        {COPY.source.previewEmpty}
      </p>
    );
  }

  return (
    <svg
      className="request-design-case__preview"
      viewBox={`0 0 ${String(canvasWidthPx)} ${String(canvasHeightPx)}`}
      role="img"
      aria-label={COPY.source.previewLabel}
      data-testid={testId}
    >
      {document.elements.map((element) => (
        <PreviewElement
          key={element.id}
          element={element}
          matrix={matrixOf(graph, element.id)}
          selected={element.id === selectedElementId}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

/**
 * The engine's effective matrix as an SVG `transform`, or `null`.
 *
 * `resolveEffectiveTransform` returns a union — the transform, or a typed
 * geometry finding — so the finding is narrowed away rather than assumed absent.
 * The six components are serialised in SVG's own order; no arithmetic is done on
 * them here.
 */
function matrixOf(graph: ElementGraph, elementId: string): string | null {
  const resolved = resolveEffectiveTransform(graph, elementId);
  if (isGeometryFinding(resolved)) return null;
  const { a, b, c, d, e, f } = resolved.matrix;
  return `matrix(${String(a)} ${String(b)} ${String(c)} ${String(d)} ${String(e)} ${String(f)})`;
}

interface PreviewElementProps {
  readonly element: DesignElement;
  readonly matrix: string | null;
  readonly selected: boolean;
  readonly onSelect?: ((elementId: string) => void) | undefined;
}

/**
 * One element, drawn in its **local** box and placed by the engine's matrix.
 *
 * The engine defines an element's local space as `0,0` to `width,height` and
 * folds the authored `x`/`y`, the rotation and the scale into the effective
 * matrix. Drawing at the local origin and applying that matrix is therefore the
 * whole of the geometry here — an element positioned at `x`/`y` directly *and*
 * transformed would be placed twice.
 *
 * A group paints nothing of its own (`IMP-D045` PO-07); its children carry the
 * composed matrix and are already in the element array in their own right.
 */
function PreviewElement({ element, matrix, selected, onSelect }: PreviewElementProps) {
  if (matrix === null || element.type === 'group' || !element.visible) {
    return null;
  }

  const interactive = onSelect !== undefined;
  const select = () => {
    onSelect?.(element.id);
  };

  return (
    <g
      transform={matrix}
      opacity={element.opacity}
      data-selected={selected}
      data-element-type={element.type}
      data-testid={`design-element-${element.id}`}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            onClick: select,
            onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                select();
              }
            },
          }
        : {})}
    >
      <ElementBody element={element} />
      {selected ? (
        <rect
          className="request-design-case__preview-selection"
          x={0}
          y={0}
          width={element.transform.width}
          height={element.transform.height}
          fill="none"
        />
      ) : null}
    </g>
  );
}

/**
 * The element's own paint, by kind.
 *
 * Text renders as `<text>` with the document's own fill and size. The font is
 * **not** named here: `fontId` addresses the controlled registry (`APP3-F01`,
 * `IMP-D044` PO-10), and turning it into a CSS family in this file would be a
 * second font authority. The stage inherits the Admin surface's own family,
 * which is an honest approximation for a bounded preview rather than a claim
 * that this is exactly what will be stitched.
 *
 * An image element draws its frame rather than its bytes: the pixels live behind
 * a protected media route, and a preview that fetched them would be issuing an
 * authorization this component does not own.
 */
function ElementBody({ element }: { readonly element: DesignElement }) {
  const { width, height } = element.transform;

  if (element.type === 'text') {
    return (
      <text
        x={0}
        y={element.fontSizePx}
        fontSize={element.fontSizePx}
        fontWeight={element.fontWeight}
        fontStyle={element.fontStyle}
        fill={element.fill}
      >
        {element.text}
      </text>
    );
  }

  if (element.type === 'shape') {
    return element.shape === 'ellipse' ? (
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={element.strokeWidthPx}
      />
    ) : (
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
  }

  return (
    <rect
      className="request-design-case__preview-placeholder"
      x={0}
      y={0}
      width={width}
      height={height}
      fill="none"
    />
  );
}
