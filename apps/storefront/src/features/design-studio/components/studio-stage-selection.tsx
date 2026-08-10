'use client';

import type { Bounds2D } from '@embroidery/design-engine';

export interface StudioStageSelectionProps {
  readonly bounds: Bounds2D;
}

/**
 * The outline around the selected element (`606:63`).
 *
 * Its geometry is `APP3-P02`'s transformed, stroke-aware AABB and nothing else.
 * Not `getBoundingClientRect()`, not a `DOMRect`, not a CSS layout box: those
 * are measurements of what the browser happened to lay out at the current zoom
 * and device pixel ratio, and an outline drawn from one would drift from the
 * document the moment the stage was resized. The engine's answer is in document
 * space, so it is right at every size by construction.
 *
 * There are no handles. The approved selected state shows an outline, and a
 * handle is a promise: something that looks grabbable but does not move is
 * worse than nothing, and moving belongs to `APP3-S03`. `aria-hidden` and
 * `pointer-events` off in SCSS, because this is a presentation of the selection
 * the element itself already announces — a second focusable node over the same
 * element would put an unlabelled stop in the keyboard path.
 */
export function StudioStageSelection({ bounds }: StudioStageSelectionProps) {
  return (
    <rect
      className="studio-stage__selection"
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxY - bounds.minY}
      aria-hidden="true"
      data-testid="studio-stage-selection"
    />
  );
}
