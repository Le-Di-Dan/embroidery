'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import type { AreaDraft, SideDraft } from '../model/placement-draft';
import { areaWithinCanvas, parseNumber } from '../model/placement-validation';

interface PlacementPreviewProps {
  readonly side: SideDraft | null;
  readonly selectedAreaKey: string | null;
  readonly onSelectArea: (areaKey: string) => void;
}

/**
 * The side canvas with its embroidery areas (`596:7`, middle column).
 *
 * Rendered as **SVG**, which is what `05-FRONTEND-AND-SCSS-STANDARD.md` §8
 * prescribes for geometry — "Canvas/SVG rendering APIs for Design Studio
 * geometry rather than DOM CSS positioning" — and what `IMP-D026` locks as the
 * rendering architecture. DOM positioning would need per-element inline styles
 * or CSS custom properties, both of which that section prohibits outright.
 *
 * The choice is more than compliance. The `viewBox` **is** the side's own pixel
 * space, so every rectangle is drawn at the operator's authored coordinates with
 * no scaling arithmetic anywhere in this file: no percentages, no computed
 * offsets, nothing to round. The browser scales the whole coordinate system, so
 * the preview stays proportional at every breakpoint (`618:74`) for free, and
 * the model is never converted, never rounded into state and never written back
 * (`APP3-A01` §13).
 *
 * The background image is not fetched. `APP2` publishes no authenticated Admin
 * media-delivery route — its own asset picker renders placeholders for the same
 * reason — and the public side-background route is explicitly not an authoring
 * dependency (§15), because it requires the product to be published and would
 * make an unpublished product unauthorable.
 *
 * An area that lies outside the canvas is still drawn, clipped by the frame,
 * and flagged. Hiding it would remove the only visual evidence of the mistake
 * the inspector is complaining about.
 */
export function PlacementPreview({ side, selectedAreaKey, onSelectArea }: PlacementPreviewProps) {
  const canvasWidth = side === null ? null : parseNumber(side.imageWidthPx);
  const canvasHeight = side === null ? null : parseNumber(side.imageHeightPx);

  if (
    side === null ||
    canvasWidth === null ||
    canvasHeight === null ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return (
      <section className="placement-preview" aria-label={PLACEMENT_COPY.preview.title}>
        <h2 className="placement-preview__title">{PLACEMENT_COPY.preview.title}</h2>
        <p className="placement-preview__empty">{PLACEMENT_COPY.preview.empty}</p>
      </section>
    );
  }

  // Type inside the canvas is expressed in canvas units, so it scales with the
  // drawing. Deriving it from `canvasWidth` is what keeps the *rendered* size
  // roughly constant: the stage sets the width and the viewBox height follows,
  // so the on-screen scale is always `renderedWidth / canvasWidth` — and a
  // divisor of the same quantity cancels out. A side authored at 800px and one
  // at 4000px therefore label at the same legible size, which a fixed unit
  // count or `Math.max` of both axes would not do.
  const labelSize = canvasWidth / 26;

  return (
    <section className="placement-preview" aria-label={PLACEMENT_COPY.preview.title}>
      <h2 className="placement-preview__title">{PLACEMENT_COPY.preview.title}</h2>

      <div className="placement-preview__stage">
        <p className="placement-preview__placeholder">
          {PLACEMENT_COPY.preview.backgroundPlaceholder}
        </p>

        <svg
          className="placement-preview__canvas"
          viewBox={`0 0 ${String(canvasWidth)} ${String(canvasHeight)}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={PLACEMENT_COPY.preview.canvasLabel(canvasWidth, canvasHeight)}
          data-testid="placement-preview-canvas"
        >
          {side.areas
            .filter((area) => !area.removed && area.retiredAt === null)
            .map((area) => (
              <AreaRectangle
                key={area.key}
                area={area}
                side={side}
                labelSize={labelSize}
                selected={area.key === selectedAreaKey}
                onSelect={onSelectArea}
              />
            ))}
        </svg>
      </div>

      <p className="placement-preview__meta">
        {PLACEMENT_COPY.preview.canvasLabel(canvasWidth, canvasHeight)}
      </p>
    </section>
  );
}

interface AreaRectangleProps {
  readonly area: AreaDraft;
  readonly side: SideDraft;
  readonly labelSize: number;
  readonly selected: boolean;
  readonly onSelect: (areaKey: string) => void;
}

/**
 * One embroidery area, drawn at its authored coordinates.
 *
 * Selection and validity travel as `data-` attributes rather than class
 * variants because SVG's `className` is an `SVGAnimatedString` that React
 * handles inconsistently across elements; predefined `[data-*]` selectors are
 * one of the mechanisms §8 names, and they keep every appearance decision in
 * SCSS.
 *
 * `<g role="button">` is a real control: focusable, activated by Enter and
 * Space, and labelled. An SVG shape carries none of that on its own, and the
 * inspector is not a substitute for being able to pick an area on the canvas.
 */
function AreaRectangle({ area, side, labelSize, selected, onSelect }: AreaRectangleProps) {
  const x = parseNumber(area.boundXPx);
  const y = parseNumber(area.boundYPx);
  const width = parseNumber(area.boundWidthPx);
  const height = parseNumber(area.boundHeightPx);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  const contained = areaWithinCanvas(side, area);
  const name = area.name.trim() === '' ? PLACEMENT_COPY.hierarchy.unnamedArea : area.name;
  const inset = labelSize / 2;

  const select = () => {
    onSelect(area.key);
  };

  return (
    <g
      className="placement-preview__area"
      role="button"
      tabIndex={0}
      aria-label={PLACEMENT_COPY.preview.areaLabel(name)}
      aria-pressed={selected}
      data-selected={selected}
      data-invalid={!contained}
      data-testid={`placement-preview-area-${area.key}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      }}
    >
      <rect className="placement-preview__area-rect" x={x} y={y} width={width} height={height} />

      {/* The safe boundary is a presentation of the same rectangle, not a
          second geometry: A01 authors the area bounds and nothing else. */}
      <rect
        className="placement-preview__safe"
        x={x + inset}
        y={y + inset}
        width={Math.max(width - inset * 2, 0)}
        height={Math.max(height - inset * 2, 0)}
      />

      <text
        className="placement-preview__area-name"
        x={x + inset}
        y={y + labelSize * 1.4}
        fontSize={labelSize}
      >
        {name}
      </text>

      {contained ? null : (
        <text
          className="placement-preview__area-error"
          x={x + inset}
          y={y + height - inset}
          fontSize={labelSize}
        >
          {PLACEMENT_COPY.preview.outsideCanvas}
        </text>
      )}
    </g>
  );
}
