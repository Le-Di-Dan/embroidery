'use client';

/**
 * Inspection surface: everything the benchmark reads *about* a running scene
 * (heap/leak behaviour, pointer state, element geometry) as opposed to the
 * lifecycle and measurement API in `runner.ts`.
 */
import { heapBytes, round, settle } from './metrics';
import { MIN_TOUCH_TARGET_PX, type GestureLog, type PointerController } from './pointer';
import type { RendererAdapter } from '../adapters/types';

export interface LeakResult {
  readonly cycles: number;
  readonly heapStartBytes: number | null;
  readonly heapEndBytes: number | null;
  readonly growthBytes: number | null;
  readonly monotonic: boolean | null;
  readonly domNodesAfter: number;
}

export interface PointerState {
  readonly mode: string;
  readonly activePointers: number;
  readonly selection: readonly string[];
  readonly zoom: number;
  readonly panXPx: number;
  readonly log: readonly GestureLog[];
  readonly handleCount: number;
  readonly minHandleSizePx: number;
  readonly targetMinPx: number;
  readonly touchActionNone: boolean;
  readonly svgScriptExecuted: boolean;
}

export interface ElementBox {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Mount/destroy `cycles` times and compare the second half of the heap samples
 * with the first. Chromium exposes `performance.memory`; other engines report
 * `null` rather than a fabricated number.
 */
export async function runLeakProbe(
  cycles: number,
  container: HTMLElement,
  mountCycle: () => Promise<void>,
  teardown: () => void,
): Promise<LeakResult> {
  const heapStartBytes = heapBytes();
  const samples: number[] = [];
  for (let index = 0; index < cycles; index += 1) {
    await mountCycle();
    const sample = heapBytes();
    if (sample !== null) {
      samples.push(sample);
    }
  }
  teardown();
  await settle();
  const heapEndBytes = heapBytes();
  const half = Math.floor(samples.length / 2);
  return {
    cycles,
    heapStartBytes,
    heapEndBytes,
    growthBytes:
      heapStartBytes === null || heapEndBytes === null ? null : heapEndBytes - heapStartBytes,
    monotonic:
      samples.length < 4
        ? null
        : average(samples.slice(half)) > average(samples.slice(0, half)) * 1.5,
    domNodesAfter: container.querySelectorAll('*').length,
  };
}

export function readPointerState(
  adapter: RendererAdapter,
  pointer: PointerController | null,
  container: HTMLElement,
): PointerState {
  const handles = [...container.querySelectorAll<HTMLElement>('[data-handle]')];
  const sizes = handles.map((handle) => handle.getBoundingClientRect().width);
  const viewport = adapter.getViewport();
  return {
    mode: pointer?.mode ?? 'detached',
    activePointers: pointer?.activePointers ?? 0,
    selection: adapter.getSelection(),
    zoom: round(viewport.zoom),
    panXPx: round(viewport.panXPx),
    log: pointer?.log ?? [],
    handleCount: handles.length,
    minHandleSizePx: sizes.length === 0 ? 0 : Math.min(...sizes),
    targetMinPx: MIN_TOUCH_TARGET_PX,
    touchActionNone: container.style.touchAction === 'none',
    svgScriptExecuted:
      (window as unknown as { __svgScriptExecuted?: boolean }).__svgScriptExecuted === true,
  };
}

export function readElementBox(adapter: RendererAdapter, id: string): ElementBox | null {
  const element = adapter.serialize().elements.find((candidate) => candidate.id === id);
  return element === undefined
    ? null
    : {
        xPx: element.xPx,
        yPx: element.yPx,
        widthPx: element.widthPx,
        heightPx: element.heightPx,
      };
}
