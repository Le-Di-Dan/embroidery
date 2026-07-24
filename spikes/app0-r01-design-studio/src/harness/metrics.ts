'use client';

/** Measurement primitives shared by every candidate, so nothing is engine-tuned. */

export interface Stat {
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function summarize(values: readonly number[]): Stat {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    max: round(values.length === 0 ? 0 : Math.max(...values)),
    mean: round(values.length === 0 ? 0 : total / values.length),
  };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame((timestamp) => {
      resolve(timestamp);
    });
  });
}

/** Waits for the frame after the next one, i.e. for the commit to be painted. */
export async function settle(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

export interface LongTaskRecorder {
  stop(): { count: number; totalMs: number; maxMs: number };
}

export function recordLongTasks(): LongTaskRecorder {
  const durations: number[] = [];
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    observer = null;
  }
  return {
    stop() {
      observer?.disconnect();
      return {
        count: durations.length,
        totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
        maxMs: round(durations.length === 0 ? 0 : Math.max(...durations)),
      };
    },
  };
}

interface MemoryCapablePerformance extends Performance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

/** Chromium-only; other engines report null rather than a fabricated number. */
export function heapBytes(): number | null {
  const memory = (performance as MemoryCapablePerformance).memory;
  return memory === undefined ? null : memory.usedJSHeapSize;
}

/**
 * Runs `step` once per animation frame and returns the per-frame durations.
 * Identical driver for every engine and every gesture kind.
 */
export async function measureFrames(
  frames: number,
  step: (index: number) => void,
): Promise<{ frames: Stat; dropped: number; slow: number }> {
  const durations: number[] = [];
  let previous = await nextFrame();
  for (let index = 0; index < frames; index += 1) {
    step(index);
    const timestamp = await nextFrame();
    durations.push(timestamp - previous);
    previous = timestamp;
  }
  return {
    frames: summarize(durations),
    dropped: durations.filter((value) => value > 33.4).length,
    slow: durations.filter((value) => value > 20).length,
  };
}
