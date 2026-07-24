/**
 * The single adapter contract every candidate implements. It is deliberately
 * engine-neutral and identical for all three finalists so that no benchmark can
 * favour one engine's idioms.
 *
 * The adapter owns the mutable runtime objects. React and Zustand must never
 * hold them (FRONTEND_CONVENTIONS §10/§12); the harness keeps the adapter in a
 * module-level ref, not in component state.
 */
import type { SpikeDesignDocument, TransformPatch, Viewport } from '../document/types';
import type { WatermarkPolicy } from '../harness/watermark';

export type EngineId = 'konva' | 'fabric' | 'svg';

export interface AdapterMetrics {
  /** Live scene node count (DOM nodes for SVG, engine nodes otherwise). */
  readonly nodeCount: number;
  /** DOM nodes inside the mount container, for the SVG-vs-canvas comparison. */
  readonly domNodeCount: number;
}

export interface MountOptions {
  readonly container: HTMLElement;
  readonly document: SpikeDesignDocument;
  readonly watermark: WatermarkPolicy;
}

export interface RendererAdapter {
  readonly engine: EngineId;
  mount(options: MountOptions): Promise<void>;
  /** Replaces the whole scene; the watermark is always re-created from policy. */
  load(document: SpikeDesignDocument): Promise<void>;

  select(ids: readonly string[]): void;
  getSelection(): readonly string[];
  /** Attempts to select every selectable node; must never return the watermark. */
  selectAll(): readonly string[];
  deleteSelected(): void;

  transform(id: string, patch: TransformPatch): void;
  setZIndex(id: string, index: number): void;
  setLocked(id: string, locked: boolean): void;
  setHidden(id: string, hidden: boolean): void;
  group(ids: readonly string[]): string;
  ungroup(groupId: string): void;

  setViewport(viewport: Viewport): void;
  getViewport(): Viewport;

  /**
   * Viewport-space hit test. This is the ONLY part of pointer handling that is
   * engine-specific; gesture recognition and handles are shared DOM code.
   */
  hitTest(clientX: number, clientY: number): string | null;

  /** Engine-neutral document only. Never engine-native JSON. */
  serialize(): SpikeDesignDocument;

  /** True when the engine still holds a watermark layer on top of the scene. */
  hasWatermarkOnTop(): boolean;

  metrics(): AdapterMetrics;
  destroy(): void;
}

export interface AdapterFactory {
  readonly engine: EngineId;
  create(): RendererAdapter;
}
