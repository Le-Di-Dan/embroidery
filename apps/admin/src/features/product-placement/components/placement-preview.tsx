'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import type { AreaDraft, SideDraft } from '../model/placement-draft';
import { areaWithinCanvas, parseNumber } from '../model/placement-validation';
import type { BackgroundFailure } from '../model/placement-failure';

/**
 * Why the background is not simply "loaded or not".
 *
 * Four of these states are *not* failures, and presenting them as one would be
 * wrong in a way the operator would act on: `pending` and `unsaved-side` mean
 * the server is serving something other than what the draft names, so drawing
 * anything would misrepresent an unsaved choice as already applied.
 */
export type BackgroundState =
  | { readonly kind: 'ready'; readonly objectUrl: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'unsaved-side' }
  | { readonly kind: 'failed'; readonly failure: BackgroundFailure; readonly onRetry: () => void };

interface PlacementPreviewProps {
  readonly side: SideDraft | null;
  readonly selectedAreaKey: string | null;
  readonly onSelectArea: (areaKey: string) => void;
  readonly background: BackgroundState;
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
 * The background arrives as an `<image>` in the **same** coordinate space
 * (`APP3-A01-C1`), drawn at `0,0` across the authored canvas so the areas above
 * it land on the artwork rather than beside it. `xMidYMid meet` is deliberate:
 * the derivative's intrinsic size is a separate fact from the Side's authored
 * canvas (`APP3-B02` says so explicitly), so letting it letterbox is the only
 * option that cannot distort the image — and distortion is the failure an
 * operator would trust and author against.
 *
 * The bytes come from `APP3-B02A` and nowhere else: no public route, no storage
 * URL, no asset-by-id bypass. The `objectUrl` here is a browser handle owned by
 * `useSideBackground`, never a storage address and never persisted.
 *
 * An area that lies outside the canvas is still drawn, clipped by the frame,
 * and flagged. Hiding it would remove the only visual evidence of the mistake
 * the inspector is complaining about.
 */
export function PlacementPreview({
  side,
  selectedAreaKey,
  onSelectArea,
  background,
}: PlacementPreviewProps) {
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
        <BackgroundNotice background={background} />

        <svg
          className="placement-preview__canvas"
          viewBox={`0 0 ${String(canvasWidth)} ${String(canvasHeight)}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={PLACEMENT_COPY.preview.canvasLabel(canvasWidth, canvasHeight)}
          data-testid="placement-preview-canvas"
        >
          {/*
            The bottom layer, in the Side's own pixel space. Declared before the
            areas so painting order puts the artwork underneath them — SVG has no
            z-index, document order *is* the stacking.

            `aria-hidden`: it is contextual artwork, not a control. The areas
            above it are the interactive elements, and announcing the artwork
            would put a non-actionable node in the operator's path (§14).
          */}
          {background.kind === 'ready' ? (
            <image
              className="placement-preview__background"
              href={background.objectUrl}
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
              data-testid="placement-preview-background"
            />
          ) : null}

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

/**
 * What the stage says when it is not showing artwork.
 *
 * Nothing is rendered in the `ready` state: a notice over a loaded background
 * would sit on top of the very thing it was reporting about.
 *
 * `role="status"` for the states that are just information, `role="alert"` only
 * for the two real failures — a background that is still loading is not
 * something to interrupt an operator for.
 */
function BackgroundNotice({ background }: { readonly background: BackgroundState }) {
  if (background.kind === 'ready') return null;

  if (background.kind === 'failed') {
    const message =
      background.failure === 'unavailable'
        ? PLACEMENT_COPY.preview.backgroundUnavailable
        : PLACEMENT_COPY.preview.backgroundFailed;
    return (
      <div
        className="placement-preview__notice"
        role="alert"
        data-testid="placement-background-notice"
      >
        <p className="placement-preview__notice-text">{message}</p>
        {/* Retry is offered only where retrying can work: a 404 means the server
            will not resolve a background at this address at all. */}
        {background.failure === 'retryable' ? (
          <button
            type="button"
            className="placement-preview__notice-action"
            data-testid="placement-background-retry"
            onClick={background.onRetry}
          >
            {PLACEMENT_COPY.preview.backgroundRetry}
          </button>
        ) : null}
      </div>
    );
  }

  const message = {
    loading: PLACEMENT_COPY.preview.backgroundLoading,
    pending: PLACEMENT_COPY.preview.backgroundPending,
    'unsaved-side': PLACEMENT_COPY.preview.backgroundUnsavedSide,
  }[background.kind];

  return (
    <div
      className="placement-preview__notice"
      role="status"
      data-testid="placement-background-notice"
    >
      <p className="placement-preview__notice-text">{message}</p>
    </div>
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
      {/*
        A light under-stroke, drawn first so the coloured outline sits on top of
        it. Before this, an area boundary could disappear entirely against a
        background of a similar hue — and the operator authoring on that
        background is exactly who needs to see it. The halo is not decoration:
        it is what makes the outline legible over *arbitrary* artwork.
      */}
      <rect className="placement-preview__area-halo" x={x} y={y} width={width} height={height} />
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
