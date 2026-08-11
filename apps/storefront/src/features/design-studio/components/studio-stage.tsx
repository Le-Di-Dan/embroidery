'use client';

import type { Bounds2D } from '@embroidery/design-engine';

import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import { resolveElementBounds, type RenderableScene } from '../renderer/studio-scene';
import { StudioStageElement } from './studio-stage-element';
import { StudioStageSelection } from './studio-stage-selection';

export interface StudioStageProps {
  readonly scene: RenderableScene;
  /** The embroidery area rectangle in document space, or `null`. */
  readonly area: Bounds2D | null;
  /** A browser object URL for the Side background, or `null`. */
  readonly backgroundUrl: string | null;
  /**
   * Object URLs for placed images, by `derivativeId` (`APP3-S06`).
   *
   * Keyed by derivative rather than by element because one Asset may be placed
   * several times and must be fetched once — the same reason `APP3-P01-C1`
   * counts decoded pixels per unique Asset. An id with no entry has no bytes,
   * and the element draws the honest placeholder instead.
   */
  readonly media: ReadonlyMap<string, string>;
  readonly selectedElementId: string | null;
  readonly onSelect: (elementId: string) => void;
  readonly onClearSelection: () => void;
}

/**
 * The production Design Studio stage (`606:3`, `606:63`, `606:133`).
 *
 * Rendered as **native SVG by React**, which `IMP-D026` and `ADR-APP0-001` lock
 * as the rendering architecture and `05-FRONTEND-AND-SCSS-STANDARD.md` §8
 * prescribes for geometry. There is no `<canvas>`, no Konva, no Fabric, no Pixi
 * and no interaction library — and no second renderer anywhere in the
 * Storefront.
 *
 * The `viewBox` **is** the document's own placement canvas, so every element is
 * drawn at its authored coordinates and no CSS scale is ever multiplied into a
 * document number. The browser scales the whole coordinate system, which is
 * what makes the stage responsive at 1024 (`618:140`) and 390 without a single
 * breakpoint touching geometry.
 *
 * Painting order is document order, bottom first. SVG has no `z-index` —
 * document order *is* the stacking, and `APP3-P01` defines the element array as
 * z-order with the same convention — so this component maps the scene's list as
 * it stands and never sorts, reverses or re-ranks it. Reordering is `APP3-S04`'s.
 *
 * Every transform and bound arrives already resolved on the scene. This
 * component composes no matrix, walks no parent chain and converts no unit: the
 * adapter asked `@embroidery/design-engine`, and `IMP-D045` locks the answer.
 *
 * Nothing here mutates the document. There is no pointer-move handler, no drag,
 * no resize, no rotate and no keyboard nudge, because `APP3-S03` owns transforms
 * and a stage that could move an element would also need the autosave, conflict
 * and undo behaviour that `S10` and `S08` own.
 */
export function StudioStage({
  scene,
  area,
  backgroundUrl,
  media,
  selectedElementId,
  onSelect,
  onClearSelection,
}: StudioStageProps) {
  const selectedBounds = resolveElementBounds(scene, selectedElementId);

  return (
    <svg
      className="studio-stage__canvas"
      viewBox={`0 0 ${String(scene.canvasWidthPx)} ${String(scene.canvasHeightPx)}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={STUDIO_STAGE_COPY.canvasLabel(scene.canvasWidthPx, scene.canvasHeightPx)}
      data-testid="studio-stage-canvas"
      onClick={(event) => {
        // A click that reached the canvas itself hit no element. Elements stop
        // propagation, so this cannot fire behind one.
        if (event.target === event.currentTarget) onClearSelection();
      }}
    >
      {/*
        The bottom layer, in the document's own pixel space, drawn across the
        authored canvas so the design lands on the garment rather than beside
        it. `xMidYMid meet` is deliberate: `APP3-B02` treats the derivative's
        intrinsic size as a separate fact from the Side's authored canvas, so
        letterboxing is the only option that cannot distort the image — and a
        distorted garment is one a customer would trust and design against.

        Nothing inspects the image's intrinsic dimensions to adjust document
        geometry; the document's canvas is authority in both directions.

        `aria-hidden`: contextual artwork, not a control.
      */}
      {backgroundUrl === null ? null : (
        <image
          className="studio-stage__background"
          href={backgroundUrl}
          x={0}
          y={0}
          width={scene.canvasWidthPx}
          height={scene.canvasHeightPx}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          data-testid="studio-stage-background"
        />
      )}

      {/*
        The embroidery area, exactly as persisted. It is a static boundary: no
        show/hide control, no zoom-dependent behaviour and no interaction, all
        of which belong to `APP3-S07`. Drawn from the Session's own scope
        rectangle with no inset or derived second rectangle — an invented inner
        boundary would be a second geometry nobody authored.
      */}
      {area === null ? null : (
        <rect
          className="studio-stage__area"
          x={area.minX}
          y={area.minY}
          width={area.maxX - area.minX}
          height={area.maxY - area.minY}
          aria-hidden="true"
          data-testid="studio-stage-area"
        />
      )}

      {scene.elements
        // Hidden elements are not painted and not clickable. `APP3-P02` still
        // gives them geometry — visibility is a display fact, not a geometric
        // one — which is why they are filtered here and not in the adapter.
        .filter((renderable) => renderable.visible)
        .map((renderable) => (
          <StudioStageElement
            key={renderable.id}
            renderable={renderable}
            selected={renderable.id === selectedElementId}
            mediaUrl={
              renderable.element.type === 'image'
                ? (media.get(renderable.element.derivativeId) ?? null)
                : null
            }
            onSelect={onSelect}
          />
        ))}

      {selectedBounds === null ? null : <StudioStageSelection bounds={selectedBounds} />}
    </svg>
  );
}
