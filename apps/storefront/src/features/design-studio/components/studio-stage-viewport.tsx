'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef } from 'react';

import { STUDIO_VIEWPORT_COPY } from '../model/studio-viewport-copy';
import { FIT_STEP, viewportTransform } from '../model/studio-viewport';
import { useStudioViewportStore } from '../store/studio-viewport.store';

/** A drag shorter than this is a click that wobbled, not a pan. */
const PAN_THRESHOLD_PX = 3;

export interface StudioStageViewportProps {
  readonly children: ReactNode;
  /**
   * Chrome that belongs to the **viewport box**, not to the transformed layer
   * (`APP3-S09`).
   *
   * The distinction is the whole reason this prop exists rather than another
   * child: everything in `children` is inside the zoom-and-pan transform and
   * moves with the artwork, while this is a sibling of that transform and
   * therefore covers what is on screen at any zoom or pan. The runtime
   * watermark is the only thing that needs it, and it needs it exactly.
   */
  readonly overlay?: ReactNode;
  /**
   * The `APP3-S11` touch arbitration, or `undefined` off mobile.
   *
   * Bound here rather than on the stage or the overlay because this is the one
   * node **every** touch on the design passes through — including a touch that
   * lands on a selected element, and including the second finger of a pinch that
   * lands anywhere at all. Arbitration that could not see both fingers would have
   * to guess which gesture it was in.
   */
  readonly touch?:
    | {
        readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
        readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
        readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
        readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
      }
    | undefined;
}

/**
 * The one viewport layer (`APP3-S07`).
 *
 * ## What this is, and why there is exactly one of it
 *
 * `APP3-S02`'s scene is untouched: one `<svg>`, one `viewBox` that is the
 * document's own placement canvas, every element at the matrix `APP3-P02`
 * resolved. Zoom and pan happen **outside** it, as a single CSS transform on the
 * wrapper this component renders.
 *
 * That placement is the mitigation for the one measured risk in the rendering
 * architecture, and it does three things at once:
 *
 * - **No element transform is ever multiplied by the zoom.** The scene is not
 *   rebuilt, `APP3-P02` is not consulted again, and the adapter cannot even see
 *   that a viewport exists. Zooming moves the picture of the design, not the
 *   design.
 * - **Everything stays aligned by construction.** The background, the embroidery
 *   area, every element and the selection outline are inside the transformed
 *   layer, so they scale and translate as one. There is no second overlay that
 *   could drift out of register at 3× — which is exactly what a CSS-positioned
 *   selection box would do.
 * - **Hit testing stays correct for free.** The browser inverts the transform
 *   when it routes a pointer event, so a click at 4× selects the element that is
 *   actually under the cursor without this feature computing a single
 *   coordinate. Selection identity is never derived from CSS pixels.
 *
 * ## Panning moves the view and nothing else
 *
 * A drag is recognised only when it starts on the **stage surface** — the
 * letterboxed frame or the `<svg>` root itself. An element is never a pan
 * handle, because `APP3-S03` owns dragging an element and a gesture that means
 * "move the view" today cannot quietly mean "move the artwork" tomorrow. The
 * background image and the area rectangle are `pointer-events: none`, so they
 * can never become the target of one of these events.
 *
 * The gesture also has to coexist with `APP3-S02`'s "click the empty stage to
 * clear the selection". It does: a press that never passes the threshold stays a
 * click and still clears, and a real drag swallows the trailing click in the
 * capture phase so panning cannot silently deselect.
 */
export function StudioStageViewport({ children, overlay, touch }: StudioStageViewportProps) {
  const zoomStep = useStudioViewportStore((state) => state.zoomStep);
  const panXRatio = useStudioViewportStore((state) => state.panXRatio);
  const panYRatio = useStudioViewportStore((state) => state.panYRatio);
  const panByPixels = useStudioViewportStore((state) => state.panByPixels);

  // Gesture bookkeeping, deliberately in refs rather than in the store: it is
  // per-gesture scratch that no other component may read, and a store holding
  // it would outlive the drag that created it.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const suppressClick = useRef(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Any new interaction starts clean. This is what stops a suppression from
    // outliving the gesture that set it: a browser does not always deliver the
    // trailing click after a captured drag, and a flag left standing would
    // swallow the customer's *next* click — an element that refuses to be
    // selected exactly once, which is close to impossible to reproduce.
    suppressClick.current = false;

    // Mouse and pen only. A touch drag is a gesture, and gestures on the stage
    // are `APP3-S11`'s — claiming them here would both pre-empt that checkpoint
    // and take the page's own scroll away from a customer on a phone.
    if (event.pointerType === 'touch') return;
    if (!isStageSurface(event.target) || event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    capture(event.currentTarget, event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = origin.current;
    if (start === null) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (
      !moved.current &&
      Math.abs(deltaX) < PAN_THRESHOLD_PX &&
      Math.abs(deltaY) < PAN_THRESHOLD_PX
    ) {
      return;
    }
    moved.current = true;
    origin.current = { x: event.clientX, y: event.clientY };

    // The only measurement this feature takes of the browser's layout, read at
    // the moment of the gesture and never stored. It converts a pointer delta
    // into a pan ratio; it is not, and can never become, document geometry —
    // `APP3-P02` remains the only source of anything the stage draws.
    panByPixels(deltaX, deltaY, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (origin.current === null) return;
    origin.current = null;
    suppressClick.current = moved.current;
    moved.current = false;
    release(event.currentTarget, event.pointerId);
  }

  return (
    <div
      className="studio-stage__viewport"
      data-stage-surface="true"
      data-testid="studio-stage-viewport"
      // The mouse and pen path is untouched; the touch path is a second listener
      // beside it, and each ignores the pointer types the other owns.
      data-touch={touch === undefined ? undefined : 'true'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      /*
       * The touch arbitration runs in the **capture** phase.
       *
       * `APP3-S03` calls `stopPropagation()` when a gesture starts on the move
       * surface, which is right — the stage must not also treat that press as a
       * click on empty canvas. But it means a finger that lands on an element
       * never bubbles here, so a bubble-phase listener would count one touch
       * when two are down: the second finger would look like the first, and a
       * pinch that began on the artwork would silently stay an element drag.
       *
       * Capture sees every contact before any handler can stop it, which is what
       * makes "one finger is the design, two are the camera" a fact about the
       * fingers rather than about where they happened to land.
       */
      onPointerDownCapture={touch?.onPointerDown}
      onPointerMoveCapture={touch?.onPointerMove}
      onPointerUpCapture={touch?.onPointerUp}
      onPointerCancelCapture={touch?.onPointerCancel}
      onClickCapture={(event) => {
        // A drag ends with a click the browser synthesises anyway. Letting it
        // through would make every pan clear the selection.
        if (suppressClick.current) {
          suppressClick.current = false;
          event.stopPropagation();
        }
      }}
    >
      <div
        className="studio-stage__viewport-layer"
        data-stage-surface="true"
        data-testid="studio-stage-viewport-layer"
        style={{ transform: viewportTransform({ zoomStep, panXRatio, panYRatio }) }}
      >
        {children}
      </div>

      {/* Outside the transform, inside the clip: covers the visible viewport at
          every zoom step and every pan offset, and never escapes the frame. */}
      {overlay}

      {zoomStep === FIT_STEP ? null : (
        <p className="studio-stage__pan-hint" data-testid="studio-stage-pan-hint">
          {STUDIO_VIEWPORT_COPY.panHint}
        </p>
      )}
    </div>
  );
}

/*
 * Pointer capture is an improvement to the gesture, not a requirement of it.
 *
 * It keeps `pointermove` arriving while the cursor is outside the frame, which
 * makes a fast drag feel right. But the pan is already correct without it, and
 * an environment that does not implement the API must not take the *stage* down
 * with it — an unguarded call here threw inside the pointer handler and broke
 * selection on a surface that had nothing to do with panning.
 */
function capture(node: HTMLElement, pointerId: number) {
  if (typeof node.setPointerCapture === 'function') node.setPointerCapture(pointerId);
}

function release(node: HTMLElement, pointerId: number) {
  if (typeof node.hasPointerCapture !== 'function') return;
  if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
}

/**
 * Whether a pointer landed on empty stage rather than on artwork.
 *
 * Deliberately an identity test on the node itself rather than a walk up the
 * tree: the two wrappers mark themselves, and the `APP3-S02` canvas is the only
 * `<svg>` in the feature. Every drawn element is a `<g>` or a shape inside one,
 * so none of them can satisfy this.
 */
function isStageSurface(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.hasAttribute('data-stage-surface') || target.tagName.toLowerCase() === 'svg';
}
