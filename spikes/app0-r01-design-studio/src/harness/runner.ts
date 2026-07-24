'use client';

/**
 * The benchmark control surface. Playwright drives every candidate through this
 * one object, so the measurement code path is identical for all of them.
 */
import { performanceScene, type SceneSize } from '../document/scene';
import { createWatermarkPolicy } from './watermark';
import { measureFrames, recordLongTasks, settle, summarize, type Stat } from './metrics';
import { canonicalTiming, capabilityProbe, serializationProbe, watermarkProbe } from './probes';
import type { CanonicalTiming } from './probes';
import { PointerController } from './pointer';
import { readElementBox, runLeakProbe, readPointerState } from './inspection';
import type { ElementBox, LeakResult, PointerState } from './inspection';
import type { CapabilityReport, SerializationReport, WatermarkReport } from './probes';
import type { EngineId, RendererAdapter } from '../adapters/types';

const SESSION_TOKEN = 'S-4f19c0a7';
const WATERMARK = createWatermarkPolicy(SESSION_TOKEN);

/**
 * Measurement-attribution only. The repeated watermark is mandatory in the
 * product (D-008), but a candidate's frame cost must be attributable: this
 * variant keeps the watermark policy identical while emitting a negligible
 * number of tiles, so "engine is slow" can be separated from "77 extra static
 * nodes are slow". It exists solely to interpret benchmark numbers and has no
 * production meaning.
 */
const SPARSE_WATERMARK = { ...WATERMARK, tileWidthPx: 10_000, tileHeightPx: 10_000 };

export interface MountDiagnostics {
  /** Attribution switch — see SPARSE_WATERMARK. Never a product option. */
  readonly sparseWatermark?: boolean;
}

export interface GestureResult {
  readonly frames: Stat;
  readonly dropped: number;
  readonly slow: number;
  readonly longTasks: { count: number; totalMs: number; maxMs: number };
}

export interface SpikeApi {
  readonly ready: true;
  mount(engine: EngineId, size: SceneSize, diagnostics?: MountDiagnostics): Promise<void>;
  measureLoad(size: SceneSize, samples: number): Promise<{ load: Stat; firstUsable: Stat }>;
  measureGesture(
    kind: 'drag' | 'resize' | 'rotate' | 'zoom' | 'pan',
    frames: number,
  ): Promise<GestureResult>;
  measureSelection(samples: number): Promise<Stat>;
  measureUndoRedo(samples: number): Promise<Stat>;
  measureSerialization(samples: number): Promise<SerializationReport>;
  measureCanonical(size: SceneSize, samples: number): CanonicalTiming;
  capabilities(): Promise<CapabilityReport>;
  watermark(): Promise<WatermarkReport>;
  leakProbe(cycles: number): Promise<LeakResult>;
  nodeCounts(): { nodeCount: number; domNodeCount: number };
  pointerState(): PointerState;
  elementBox(id: string): ElementBox | null;
  destroy(): void;
}

declare global {
  interface Window {
    __spike?: SpikeApi;
  }
}

type Factories = Readonly<Record<EngineId, () => Promise<RendererAdapter>>>;

export function installRunner(container: HTMLElement, factories: Factories): void {
  let adapter: RendererAdapter | null = null;
  let engine: EngineId | null = null;
  let pointer: PointerController | null = null;
  container.style.position = 'relative';

  const require = (): RendererAdapter => {
    if (adapter === null) {
      throw new Error('Spike runner: no adapter mounted.');
    }
    return adapter;
  };

  const mountFresh = async (
    targetEngine: EngineId,
    size: SceneSize,
    diagnostics?: MountDiagnostics,
  ): Promise<number> => {
    pointer?.destroy();
    pointer = null;
    adapter?.destroy();
    container.replaceChildren();
    const factory = factories[targetEngine];
    adapter = await factory();
    engine = targetEngine;
    const start = performance.now();
    await adapter.mount({
      container,
      document: performanceScene(size),
      watermark: diagnostics?.sparseWatermark === true ? SPARSE_WATERMARK : WATERMARK,
    });
    await settle();
    pointer = new PointerController(adapter, container);
    return performance.now() - start;
  };

  const api: SpikeApi = {
    ready: true,

    async mount(targetEngine, size, diagnostics) {
      await mountFresh(targetEngine, size, diagnostics);
    },

    async measureLoad(size, samples) {
      const loads: number[] = [];
      const firstUsable: number[] = [];
      const document = performanceScene(size);
      for (let index = 0; index < samples; index += 1) {
        const start = performance.now();
        await require().load(document);
        loads.push(performance.now() - start);
        await settle();
        firstUsable.push(performance.now() - start);
      }
      return { load: summarize(loads), firstUsable: summarize(firstUsable) };
    },

    async measureGesture(kind, frames) {
      const current = require();
      const target = current
        .serialize()
        .elements.find((element) => !element.locked && element.visible);
      if (target === undefined) {
        throw new Error('Spike runner: no transformable element in the scene.');
      }
      current.select([target.id]);
      await settle();
      const longTasks = recordLongTasks();
      const result = await measureFrames(frames, (index) => {
        const direction = index % 2 === 0 ? 1 : -1;
        switch (kind) {
          case 'drag':
            current.transform(target.id, { dxPx: direction * 2, dyPx: direction });
            break;
          case 'resize':
            current.transform(target.id, { dWidthPx: direction * 2, dHeightPx: direction });
            break;
          case 'rotate':
            current.transform(target.id, { dRotationDeg: direction * 2 });
            break;
          case 'zoom':
            current.setViewport({ zoom: 1 + (index % 20) * 0.05, panXPx: 0, panYPx: 0 });
            break;
          case 'pan':
            current.setViewport({ zoom: 1.5, panXPx: -index * 2, panYPx: -index });
            break;
          default:
            break;
        }
      });
      return { ...result, longTasks: longTasks.stop() };
    },

    async measureSelection(samples) {
      const current = require();
      const ids = current
        .serialize()
        .elements.filter((element) => !element.locked && element.visible)
        .map((element) => element.id);
      const times: number[] = [];
      for (let index = 0; index < samples; index += 1) {
        const id = ids[index % ids.length] ?? ids[0];
        const start = performance.now();
        current.select(id === undefined ? [] : [id]);
        await settle();
        times.push(performance.now() - start);
      }
      return summarize(times);
    },

    async measureUndoRedo(samples) {
      const current = require();
      const times: number[] = [];
      for (let index = 0; index < samples; index += 1) {
        const snapshot = current.serialize();
        const target = snapshot.elements[0];
        if (target === undefined) {
          break;
        }
        current.transform(target.id, { dxPx: 5 });
        await settle();
        const start = performance.now();
        await current.load(snapshot);
        await settle();
        times.push(performance.now() - start);
      }
      return summarize(times);
    },

    measureSerialization(samples) {
      return serializationProbe(require(), samples);
    },

    measureCanonical(size, samples) {
      return canonicalTiming(performanceScene(size), size, samples);
    },

    capabilities() {
      return capabilityProbe(require());
    },

    watermark() {
      return watermarkProbe(require(), WATERMARK.marker);
    },

    leakProbe(cycles) {
      const targetEngine = engine;
      if (targetEngine === null) {
        throw new Error('Spike runner: leak probe needs a mounted engine.');
      }
      return runLeakProbe(
        cycles,
        container,
        async () => {
          await mountFresh(targetEngine, 'M');
        },
        () => {
          pointer?.destroy();
          pointer = null;
          adapter?.destroy();
          adapter = null;
          container.replaceChildren();
        },
      );
    },

    nodeCounts() {
      const metrics = require().metrics();
      return { nodeCount: metrics.nodeCount, domNodeCount: metrics.domNodeCount };
    },

    pointerState() {
      return readPointerState(require(), pointer, container);
    },

    elementBox(id) {
      return readElementBox(require(), id);
    },

    destroy() {
      pointer?.destroy();
      pointer = null;
      adapter?.destroy();
      adapter = null;
      container.replaceChildren();
    },
  };

  window.__spike = api;
}
