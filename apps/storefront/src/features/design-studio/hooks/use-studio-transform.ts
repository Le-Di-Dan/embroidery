'use client';

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { DesignDocument, DesignElementTransform } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';
import { buildElementGraph, type Vector2D } from '@embroidery/design-engine';

import { screenDeltaToDocument, type StageMapping } from '../model/studio-stage-mapping';
import {
  type StudioAreaLimits,
  type TransformRefusal,
  ruleOnCandidate,
  withTransform,
} from '../model/studio-transform-authority';
import type { ResizeHandleId } from '../model/studio-transform-handles';
import {
  type ElementFrames,
  elementFrames,
  moveCandidate,
  resizeCandidate,
  rotateCandidate,
  rotationAnchors,
} from '../model/studio-transform';
import { useStudioDocumentStore } from '../store/studio-document.store';

export type TransformGestureKind = 'move' | 'resize' | 'rotate';

/** Everything one gesture needs, frozen at `pointerdown` and never re-read. */
interface ActiveGesture {
  readonly kind: TransformGestureKind;
  readonly handle: ResizeHandleId | undefined;
  readonly elementId: string;
  readonly originXPx: number;
  readonly originYPx: number;
  readonly startTransform: DesignElementTransform;
  readonly startDocument: DesignDocument;
  readonly frames: ElementFrames;
  readonly rotateStartVector: Vector2D | undefined;
  readonly mapping: StageMapping;
}

export interface StudioTransformApi {
  readonly refusal: TransformRefusal | null;
  readonly isTransforming: boolean;
  readonly beginMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly beginResize: (handle: ResizeHandleId, event: ReactPointerEvent<HTMLElement>) => void;
  readonly beginRotate: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface StudioTransformOptions {
  readonly document: DesignDocument | null;
  readonly elementId: string | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  readonly zoom: number;
  /** The overlay node, read only for its untransformed layout size. */
  readonly overlay: RefObject<HTMLDivElement | null>;
}

/**
 * The transform gesture lifecycle (`APP3-S03`).
 *
 * ## Frozen start, total delta
 *
 * A gesture captures the document and the transform it began with, and every
 * frame recomputes the candidate from that frozen state plus the *total*
 * pointer delta. Nothing accumulates onto the previous frame. That is what makes
 * a drag out and back land on the values it started with rather than a drifted
 * neighbour of them, and it is why a refused candidate costs nothing: the next
 * frame recomputes from the same start rather than from a state the refusal left
 * behind.
 *
 * ## Refusal blocks, and blocks only the frame that was invalid
 *
 * `IMP-D045` PO-09 forbids clamping, snapping and warn-but-persist, so an
 * invalid candidate is simply not committed. Dragging further out changes
 * nothing on screen and says so in text; dragging back inside resumes exactly,
 * because the start was never disturbed. On release the last **valid** candidate
 * is what stands.
 */
export function useStudioTransform(options: StudioTransformOptions): StudioTransformApi {
  const { document, elementId, scope, limits, zoom, overlay } = options;
  const commit = useStudioDocumentStore((state) => state.commit);

  const gesture = useRef<ActiveGesture | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const [refusal, setRefusal] = useState<TransformRefusal | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);

  // Everything the frame callback reads, kept current without re-binding the
  // pointer handlers mid-gesture.
  const latest = useRef({ commit, scope, limits });
  latest.current = { commit, scope, limits };

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      gesture.current = null;
      pending.current = null;
    };
  }, []);

  function apply() {
    frame.current = null;
    const active = gesture.current;
    const point = pending.current;
    const { scope: liveScope, limits: liveLimits, commit: liveCommit } = latest.current;
    if (active === null || point === null || liveScope === null) return;

    const delta = screenDeltaToDocument(
      active.mapping,
      point.x - active.originXPx,
      point.y - active.originYPx,
    );
    const candidate = candidateFor(active, delta);
    if (candidate === undefined) {
      setRefusal('unreadable-candidate');
      return;
    }

    const outcome = ruleOnCandidate(
      withTransform(active.startDocument, active.elementId, candidate),
      active.elementId,
      liveScope,
      liveLimits,
    );
    if (outcome.ok) {
      liveCommit(outcome.document);
      setRefusal(null);
    } else {
      setRefusal(outcome.refusal);
    }
  }

  function begin(
    kind: TransformGestureKind,
    handle: ResizeHandleId | undefined,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    // Mouse and pen only. `APP3-S11` owns touch, and a touch drag here would
    // both pre-empt that checkpoint and take the page's scroll away.
    if (event.pointerType === 'touch' || event.button !== 0) return;
    if (document === null || elementId === null || scope === null) return;

    const element = document.elements.find((candidate) => candidate.id === elementId);
    if (element === undefined || element.locked || !element.visible) return;

    const frames = elementFrames(buildElementGraph(document), elementId);
    if (frames === undefined) return;

    const node = overlay.current;
    if (node === null) return;

    event.stopPropagation();
    gesture.current = {
      kind,
      handle,
      elementId,
      originXPx: event.clientX,
      originYPx: event.clientY,
      startTransform: element.transform,
      startDocument: document,
      frames,
      rotateStartVector: kind === 'rotate' ? startVectorOf(element.transform, frames) : undefined,
      mapping: {
        canvasWidthPx: document.placement.canvasWidthPx,
        canvasHeightPx: document.placement.canvasHeightPx,
        // The overlay's own layout size, read once at the start of the gesture
        // and never stored. It converts a pointer delta; it is not geometry.
        boxWidthPx: node.clientWidth,
        boxHeightPx: node.clientHeight,
        zoom,
      },
    };
    pending.current = null;
    setRefusal(null);
    setIsTransforming(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  return {
    refusal,
    isTransforming,
    beginMove: (event) => {
      begin('move', undefined, event);
    },
    beginResize: (handle, event) => {
      begin('resize', handle, event);
    },
    beginRotate: (event) => {
      begin('rotate', undefined, event);
    },
    onPointerMove: (event) => {
      if (gesture.current === null) return;
      pending.current = { x: event.clientX, y: event.clientY };
      // One update per painted frame. A pointer can outrun the compositor, and
      // recomputing per event would validate a document nobody ever sees.
      frame.current ??= requestAnimationFrame(apply);
    },
    onPointerUp: (event) => {
      if (gesture.current === null) return;
      gesture.current = null;
      pending.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setIsTransforming(false);
      const node = event.currentTarget;
      if (typeof node.hasPointerCapture === 'function' && node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
    },
  };
}

function candidateFor(active: ActiveGesture, delta: Vector2D): DesignElementTransform | undefined {
  switch (active.kind) {
    case 'move':
      return moveCandidate(active.startTransform, active.frames, delta);
    case 'resize':
      return active.handle === undefined
        ? undefined
        : resizeCandidate(active.startTransform, active.frames, active.handle, delta);
    case 'rotate':
      return active.rotateStartVector === undefined
        ? undefined
        : rotateCandidate(active.startTransform, active.rotateStartVector, delta);
    default:
      return undefined;
  }
}

/** The pivot-to-grab vector the rotation is measured from, in document space. */
function startVectorOf(
  transform: DesignElementTransform,
  frames: ElementFrames,
): Vector2D | undefined {
  const { pivot, grab } = rotationAnchors(transform, frames);
  const vector = { x: grab.x - pivot.x, y: grab.y - pivot.y };
  return vector.x === 0 && vector.y === 0 ? undefined : vector;
}
