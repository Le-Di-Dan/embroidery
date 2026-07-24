'use client';

/**
 * Engine-neutral pointer/touch controller.
 *
 * A deliberate finding of the spike: only *hit testing* differs between the
 * candidates. Gesture recognition, the transform handles and the touch target
 * sizes are plain DOM concerns and are identical for every engine, so mobile
 * behaviour is designed once (FRONTEND_CONVENTIONS §12: "Touch behaviour is
 * designed explicitly; it is not assumed to match desktop pointer behaviour").
 */
import type { RendererAdapter } from '../adapters/types';

/** Provisional minimum touch target (10 §6 "Touch target size"). */
export const MIN_TOUCH_TARGET_PX = 44;

export interface GestureLog {
  readonly kind: string;
  readonly targetId: string | null;
}

interface ActivePointer {
  readonly id: number;
  x: number;
  y: number;
}

export class PointerController {
  readonly log: GestureLog[] = [];

  #adapter: RendererAdapter;
  #container: HTMLElement;
  #pointers = new Map<number, ActivePointer>();
  #dragId: string | null = null;
  #mode: 'idle' | 'drag' | 'resize' | 'rotate' | 'pinch' = 'idle';
  #pinchStart = 0;
  #zoomStart = 1;
  #handles: HTMLElement[] = [];
  #detach: (() => void)[] = [];

  constructor(adapter: RendererAdapter, container: HTMLElement) {
    this.#adapter = adapter;
    this.#container = container;
    container.style.touchAction = 'none';
    this.#on('pointerdown', (event) => {
      this.#onDown(event);
    });
    this.#on('pointermove', (event) => {
      this.#onMove(event);
    });
    this.#on('pointerup', (event) => {
      this.#onEnd(event);
    });
    this.#on('pointercancel', (event) => {
      this.#onEnd(event);
    });
  }

  get mode(): string {
    return this.#mode;
  }

  get activePointers(): number {
    return this.#pointers.size;
  }

  destroy(): void {
    for (const detach of this.#detach) {
      detach();
    }
    this.#detach = [];
    this.#removeHandles();
  }

  #on(type: string, handler: (event: PointerEvent) => void): void {
    const listener = (event: Event) => {
      handler(event as PointerEvent);
    };
    this.#container.addEventListener(type, listener, { passive: false });
    this.#detach.push(() => {
      this.#container.removeEventListener(type, listener);
    });
  }

  #onDown(event: PointerEvent): void {
    this.#pointers.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    if (this.#pointers.size === 2) {
      this.#mode = 'pinch';
      this.#pinchStart = this.#pointerDistance();
      this.#zoomStart = this.#adapter.getViewport().zoom;
      this.log.push({ kind: 'pinch-start', targetId: null });
      return;
    }
    const handleMode = (event.target as HTMLElement | null)?.dataset.handle;
    if (handleMode === 'resize' || handleMode === 'rotate') {
      this.#mode = handleMode;
      this.log.push({ kind: `${handleMode}-start`, targetId: this.#dragId });
      return;
    }
    const hit = this.#adapter.hitTest(event.clientX, event.clientY);
    this.#dragId = hit;
    this.#adapter.select(hit === null ? [] : [hit]);
    this.#mode = hit === null ? 'idle' : 'drag';
    this.log.push({ kind: 'tap', targetId: hit });
    this.#renderHandles();
  }

  #onMove(event: PointerEvent): void {
    const pointer = this.#pointers.get(event.pointerId);
    if (pointer === undefined) {
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.#mode === 'pinch') {
      if (this.#pointers.size < 2) {
        return;
      }
      const distance = this.#pointerDistance();
      const viewport = this.#adapter.getViewport();
      if (this.#pinchStart > 0 && Math.abs(distance - this.#pinchStart) > 4) {
        this.#adapter.setViewport({
          zoom: Math.max(0.25, Math.min(6, (this.#zoomStart * distance) / this.#pinchStart)),
          panXPx: viewport.panXPx,
          panYPx: viewport.panYPx,
        });
      } else {
        // Two fingers moving together = pan, not zoom.
        this.#adapter.setViewport({
          zoom: viewport.zoom,
          panXPx: viewport.panXPx + dx,
          panYPx: viewport.panYPx + dy,
        });
      }
      return;
    }
    if (this.#dragId === null) {
      return;
    }
    switch (this.#mode) {
      case 'drag':
        this.#adapter.transform(this.#dragId, { dxPx: dx, dyPx: dy });
        break;
      case 'resize':
        this.#adapter.transform(this.#dragId, { dWidthPx: dx, dHeightPx: dy });
        break;
      case 'rotate':
        this.#adapter.transform(this.#dragId, { dRotationDeg: dx });
        break;
      default:
        return;
    }
    this.#renderHandles();
  }

  #onEnd(event: PointerEvent): void {
    this.#pointers.delete(event.pointerId);
    if (this.#pointers.size === 0) {
      this.log.push({
        kind: event.type === 'pointercancel' ? 'cancel' : 'end',
        targetId: this.#dragId,
      });
      this.#mode = 'idle';
    }
  }

  #pointerDistance(): number {
    const [first, second] = [...this.#pointers.values()];
    if (first === undefined || second === undefined) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  #removeHandles(): void {
    for (const handle of this.#handles) {
      handle.remove();
    }
    this.#handles = [];
  }

  /**
   * Handles are DOM elements, not engine nodes: they must stay at a fixed
   * physical size regardless of canvas zoom, and they must be focusable for the
   * keyboard/assistive path.
   */
  #renderHandles(): void {
    this.#removeHandles();
    const id = this.#dragId;
    if (id === null) {
      return;
    }
    const element = this.#adapter.serialize().elements.find((candidate) => candidate.id === id);
    if (element === undefined) {
      return;
    }
    const viewport = this.#adapter.getViewport();
    for (const kind of ['resize', 'rotate'] as const) {
      const handle = window.document.createElement('button');
      handle.type = 'button';
      handle.dataset.handle = kind;
      handle.setAttribute('aria-label', `${kind} selected element`);
      // Handles sit OUTSIDE the element box: on a phone the element itself is
      // often smaller than a 44 px target, so an inset handle would swallow the
      // drag gesture on exactly the elements that are hardest to hit.
      const anchorX =
        kind === 'resize'
          ? element.xPx + element.widthPx + MIN_TOUCH_TARGET_PX / 2
          : element.xPx - MIN_TOUCH_TARGET_PX / 2;
      const anchorY =
        kind === 'resize'
          ? element.yPx + element.heightPx + MIN_TOUCH_TARGET_PX / 2
          : element.yPx - MIN_TOUCH_TARGET_PX / 2;
      handle.style.cssText = [
        'position:absolute',
        `width:${String(MIN_TOUCH_TARGET_PX)}px`,
        `height:${String(MIN_TOUCH_TARGET_PX)}px`,
        `left:${String(anchorX * viewport.zoom + viewport.panXPx - MIN_TOUCH_TARGET_PX / 2)}px`,
        `top:${String(anchorY * viewport.zoom + viewport.panYPx - MIN_TOUCH_TARGET_PX / 2)}px`,
        'touch-action:none',
      ].join(';');
      this.#container.appendChild(handle);
      this.#handles.push(handle);
    }
  }
}
